# SeatSurge.

Backend for a flash-sale ticket booking system. Thousands of people can hit the same seat pool at once and
no seat ever gets sold twice. Payment confirmation happens via QR scan (UPI-style scan-to-pay), not a ticket
generated after the fact.

## Architecture

```
        Browser / phone                Browser / phone
        (place a hold)                 (scan QR, confirm payment)
              │                                │
              ▼                                ▼
        ┌───────────────────────────────────────────┐
        │              Express API (Node)            │
        │  /events  /hold  /pay/:code  /confirm       │
        │  /orders  /tickets/validate                 │
        └───────────────────┬────────────────────────┘
                             │
              ┌──────────────┴───────────────┐
              ▼                               ▼
       ┌─────────────┐                ┌──────────────┐
       │    Redis     │                │  PostgreSQL   │
       │ seat lock    │                │ source of      │
       │ (SET NX PX,  │                │ truth:         │
       │  ~3s TTL)    │                │ events, seats,  │
       └─────────────┘                │ orders, users   │
                                       │ (UNIQUE/txn      │
                                       │  backstop)       │
                                       └──────────────┘
                             ▲
                             │ every 30s
                     ┌───────┴────────┐
                     │  Sweep job      │
                     │ releases seats  │
                     │ whose hold has  │
                     │ expired          │
                     └────────────────┘
```

Two things to keep separate:

1. **Seat lock** (Redis, `SEAT_LOCK_TTL_MS` = 3s). A mutex around one seat's status transition, not a
   reservation.
2. **Seat hold** (Postgres `seats.held_until`, `SEAT_HOLD_TTL_SECONDS` = 300s). The actual reservation window —
   what a user gets after winning the race, before they have to pay.

## Concurrency control

Overselling is prevented by three layers:

1. **Redis `SET lock:seat:<id> <holder> NX PX 3000`.** `NX` only sets the key if it's absent, so exactly one
   concurrent request wins; the rest get `409` immediately without touching Postgres. The lock isn't
   explicitly released — it just expires after 3s, which is simpler than a compare-and-delete script and the
   critical section is only a few hundred ms anyway (`src/lock.js`).
2. **Postgres `SELECT ... FOR UPDATE`** inside the transaction. Row-level lock as a backup in case two
   processes both think they hold the Redis lock (e.g. after a Redis failover).
3. **`orders.seat_id UNIQUE`.** The actual guarantee. Even if the first two somehow failed, Postgres won't
   let a seat get a second order.

Verified with a k6 run: 10,000 concurrent `/hold` requests against a 500-seat pool, post-run query confirmed
exactly 500 seats sold/held, one order per seat, zero duplicates. See [Load testing](#load-testing).

## Data model

```sql
events (id, name, event_time)

seats (
  id, event_id, seat_label,
  status        -- 'available' | 'held' | 'sold'
  held_until    -- when the current hold expires; sweep job reads this
)

orders (
  id, seat_id UNIQUE, user_id,
  status          -- 'pending_payment' | 'confirmed' | 'expired' | 'failed'
  payment_code UNIQUE   -- encoded into the QR
  ticket_code UNIQUE    -- issued after confirmation, used at the venue gate
  is_redeemed
  idempotency_key UNIQUE
)

users (id, email, password_hash)
```

`payment_code` and `ticket_code` are separate on purpose — one confirms a sale, the other redeems entry.
Reusing the same code for both would let a payment link also work as an entry pass.

## Purchase sequence

```
Client                    API                      Redis              Postgres
  │  POST /hold             │                         │                   │
  ├─────────────────────────▶  SET lock NX PX 3000    │                   │
  │                         ├─────────────────────────▶                   │
  │                         │  BEGIN; SELECT...FOR UPDATE;                │
  │                         │  seat→held, order→pending_payment           │
  │                         ├──────────────────────────────────────────────▶
  │                         │  COMMIT                                     │
  │  ◀──────────────────────┤  { order, paymentQr }                       │
  │                                                                        │
  │   [user scans paymentQr with their phone]                             │
  │                                                                        │
  │  GET /pay/:code  →  styled confirm page                               │
  │  POST /pay/:code/confirm                                              │
  ├─────────────────────────▶  SET lock NX PX 3000    │                   │
  │                         ├─────────────────────────▶                   │
  │                         │  check held_until not expired               │
  │                         │  seat→sold, order→confirmed, ticket_code set│
  │                         ├──────────────────────────────────────────────▶
  │  ◀──────────────────────┤  { ticketCode }                             │
```

The frontend doesn't call `/confirm` itself. It polls `GET /orders/:id` every 2s and waits for the phone to
do it. That's what makes the QR scan a real confirmation step instead of decoration.

## Edge cases handled

| Scenario | Handling |
|---|---|
| Two requests race the same seat | Redis `NX` lock serializes them; loser gets `409` immediately |
| Redis lock expires slightly early | Postgres `UNIQUE(seat_id)` rejects the duplicate write |
| User holds a seat, never scans | `held_until` passes; sweep job releases the seat and marks the order `expired` |
| User scans after the hold expired | `/pay/:code/confirm` checks `held_until`, returns `410` |
| Same ticket scanned twice at the gate | `/tickets/validate` does an atomic `UPDATE ... WHERE is_redeemed = false` |
| Duplicate `/hold` request (client retry) | `Idempotency-Key` header maps to `orders.idempotency_key`, returns the original order |
| Local phone testing | `localhost` isn't reachable from a phone — use your LAN IP or a deployed URL, see below |

## Project structure

```
backend/
  index.js                 entrypoint — starts server + sweep job
  migrations/001_init.sql
  scripts/seed.js           seeds an event + N seats (+ optional load-test users)
  scripts/reset.js          truncates all tables
  scripts/migrate.js        runs migrations
  src/
    env.js, app.js, db.js, redis.js, lock.js
    middleware/auth.js      JWT verification, admin token check
    routes/
      auth.js                POST /signup, /login
      events.js               GET/POST /events, GET /events/:id/seats
      seats.js                 POST /events/:id/seats/:seatId/hold
      pay.js                    GET /pay/:code, POST /pay/:code/confirm
      tickets.js                 GET /orders/:id(/ticket), POST /tickets/validate
    views/payPage.js          HTML for the page the phone lands on after scanning
    jobs/sweep.js              releases expired holds every 30s
  loadtest/                     k6 scripts — spike, hold-expiry, soak
frontend/
  src/App.jsx                top-level screen state (auth → seat grid → order panel)
  src/api.js                  fetch wrapper around the backend
  src/components/
    AuthForm.jsx, SeatGrid.jsx, OrderPanel.jsx, Header.jsx, Card.jsx
  src/hooks/useCountdown.js
```

## Stack

- Backend: Node.js, Express 5, `pg` (raw SQL, no ORM), Redis, JWT auth, `qrcode`
- Frontend: React + Vite + Tailwind
- Load testing: k6

## Prerequisites

- Node.js
- PostgreSQL running locally, with a database + role SeatSurge can use
- Redis running locally (`brew install redis && brew services start redis`)

## Setup

### 1. Database

```bash
psql -U postgres -c "CREATE USER seatsurge WITH PASSWORD 'seatsurge_dev';"
psql -U postgres -c "CREATE DATABASE seatsurge OWNER seatsurge;"
```

### 2. Environment

One `.env` at the repo root, shared by both apps:

```bash
cp .env.example .env   # then edit values — see Environment variables below
```

### 3. Backend

```bash
cd backend
npm install
npm run dev
```

Migrations run automatically on startup. `npm run migrate` also exists as a standalone command.

Runs on `PORT` from `.env` (default `4000`).

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:5173` (and on your LAN IP too, since `dev` runs `vite --host`).

## Environment variables

Single `.env` at the repo root. The backend loads it explicitly (`src/env.js`), and the frontend's
`vite.config.js` sets `envDir: '../'` so Vite picks it up too.

| Variable | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` | backend | Postgres connection string |
| `REDIS_URL` | backend | Redis connection string |
| `JWT_SECRET` | backend | Signs user auth tokens |
| `ADMIN_TOKEN` | backend | Required in `x-admin-token` header to call `POST /events` |
| `PUBLIC_BASE_URL` | backend | Address embedded in generated QR codes — must be reachable by whatever device scans it |
| `PORT` | backend | Backend port (default `4000`; Render sets this automatically) |
| `FRONTEND_ORIGIN` | backend | Restricts CORS to this origin. Unset = allow any origin |
| `NODE_ENV` | backend | Set to `production` when deployed |
| `SEAT_LOCK_TTL_MS` | backend | Redis lock TTL (default `3000`) |
| `SEAT_HOLD_TTL_SECONDS` | backend | Hold TTL before a seat returns to the pool (default `300`) |
| `VITE_API_BASE` | frontend | Backend URL the frontend calls |

### Testing the QR flow with a real phone

`localhost` isn't reachable from a phone, so:

- **Same WiFi**: set `PUBLIC_BASE_URL` and `VITE_API_BASE` to your laptop's LAN IP
  (`ipconfig getifaddr en0` on macOS), not `localhost`. Phone must be on the same WiFi, not cellular. This IP
  can change (router reboot, reconnect), so re-check it if scanning stops working.
- **Deployed**: set `PUBLIC_BASE_URL` to the real backend URL. No LAN dependency.

### Deploying to Render

The root `.env` never gets deployed — it's gitignored. On Render you set the same variable names directly
in each service's dashboard.

**1. Postgres** — New → PostgreSQL. Use the Internal Database URL as `DATABASE_URL` on the backend service.

**2. Redis (Render calls it "Key Value")** — New → Key Value. Gives you a `rediss://` connection string —
that's `REDIS_URL`. The `redis` npm client auto-detects `rediss://` and enables TLS, no code changes needed.

**3. Backend — Web Service.** Root Directory: `backend`.
- Build: `npm install`
- Start: `npm start`
- Env vars: `DATABASE_URL`, `REDIS_URL` from above, plus fresh `JWT_SECRET` and `ADMIN_TOKEN` (don't reuse
  local ones), `SEAT_LOCK_TTL_MS=3000`, `SEAT_HOLD_TTL_SECONDS=300`, `NODE_ENV=production`, and
  `PUBLIC_BASE_URL` set to this service's own Render URL once you know it (deploy once, copy the URL, set
  the var, redeploy).
- Migrations run automatically on startup.
- Health checks hit `/health`.

**4. Frontend — Static Site.** Root Directory: `frontend`.
- Build: `npm run build`
- Publish directory: `dist`
- Env var: `VITE_API_BASE` set to the backend's Render URL. This is a build-time var — changing it later
  needs a rebuild, not just a restart.

**5. Lock down CORS.** Once the frontend has its URL, set `FRONTEND_ORIGIN` on the backend to it and
redeploy. Unset, it allows any origin, which is why local dev doesn't need this.

`POST /events` needs `ADMIN_TOKEN` in the `x-admin-token` header — there's no dashboard UI for creating
events, only the API, so keep that token somewhere you can find it.

## Data setup

### Create an event via the API

```bash
curl -X POST localhost:4000/events \
  -H 'Content-Type: application/json' \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -d '{"name":"SeatSurge Launch Show","eventTime":"2026-09-21T09:00:00Z","seatCount":300}'
```

### Or seed from the CLI

```bash
cd backend
npm run seed          # 500 seats + 10,000 pre-authed test users (for k6)
npm run seed 1000 0   # 1000 seats, 0 users — for manual/UI testing
npm run reset          # wipes events, seats, orders, users
```

Manual testing burns through seats fast — every hold, even ones you never confirm, consumes a seat until the
5-minute TTL releases it. Seed a large count rather than reseeding repeatedly.

`npm run seed` writes signed JWTs for every seeded user to `backend/loadtest/tokens.json` (gitignored),
which the k6 scripts read directly instead of running thousands of real signups.

## Load testing

Three k6 scripts in `backend/loadtest/`. All need seats + `tokens.json` first:

```bash
cd backend
npm run seed
cd loadtest
```

Check correctness in Postgres after any run:

```sql
SELECT status, count(*) FROM seats GROUP BY status;
SELECT seat_id, count(*) FROM orders GROUP BY seat_id HAVING count(*) > 1;  -- must return 0 rows
```

### Spike test

```bash
BASE_URL=http://localhost:4000 k6 run spike-test.js
```

One `/hold` request per seeded user (10,000 by default) at the seat pool simultaneously. Every response
should be `200` or `409`, never `5xx`.

Local run, 10,000 VUs against 500 seats: 100% of checks passed, zero `5xx`. Post-run: exactly 500 seats
sold, zero seats with more than one order. ~1,450 req/s, p95 ~5.2s on the winning requests specifically (the
losing `409`s return almost instantly — the p95 is dominated by the ~500 requests doing real DB work through
a `pg.Pool` capped at 10 connections).

### Hold-expiry test

```bash
HOLD_TTL_SECONDS=20 HOLD_COUNT=50 k6 run hold-expiry-test.js
```

Places holds, never confirms them, waits past the TTL, checks the seats got released.
`HOLD_TTL_SECONDS` needs to match `SEAT_HOLD_TTL_SECONDS` in `.env` — lower both temporarily (and restart
the backend) if you don't want to wait the full 5 minutes.

Local run: 50/50 seats held, 100% released back to `available` after TTL + sweep.

### Soak test

```bash
RATE=200 DURATION=60s k6 run soak-test.js
```

Constant request rate over time, checking for growing error rates or slowdowns that would indicate
connection pool exhaustion or leaked state.

Local run: 200 req/s for 60s, 100% checks passed, p95 ~16ms, no degradation over the run.

## API overview

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/health` | GET | — | Liveness check |
| `/signup`, `/login` | POST | — | Returns a JWT |
| `/events` | GET | — | List events |
| `/events` | POST | Admin token | Create an event + N seats |
| `/events/:eventId/seats` | GET | — | List seats and their status |
| `/events/:eventId/seats/:seatId/hold` | POST | JWT | Places a hold on a seat, returns the order + payment QR |
| `/pay/:paymentCode` | GET | — | Mobile confirm-payment page |
| `/pay/:paymentCode/confirm` | POST | — | Finalizes the sale |
| `/orders/:id` | GET | JWT (owner) | Order status, polled by the frontend |
| `/orders/:id/ticket` | GET | JWT (owner) | Entry-ticket code, once confirmed |
| `/tickets/validate` | POST | — | Gate-scan endpoint, rejects a second scan |
