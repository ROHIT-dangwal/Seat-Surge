CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    event_time    TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS seats (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id      UUID NOT NULL REFERENCES events(id),
    seat_label    TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'available'
                    CHECK (status IN ('available', 'held', 'sold')),
    held_until    TIMESTAMPTZ NULL,
    UNIQUE (event_id, seat_label)
);

CREATE TABLE IF NOT EXISTS orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seat_id         UUID NOT NULL REFERENCES seats(id) UNIQUE,
    user_id         UUID NOT NULL REFERENCES users(id),
    status          TEXT NOT NULL DEFAULT 'pending_payment'
                    CHECK (status IN ('pending_payment', 'confirmed', 'expired', 'failed')),
    payment_code    TEXT UNIQUE NOT NULL,
    ticket_code     TEXT UNIQUE,
    is_redeemed     BOOLEAN NOT NULL DEFAULT false,
    idempotency_key TEXT UNIQUE NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seats_status_held_until ON seats (status, held_until);
