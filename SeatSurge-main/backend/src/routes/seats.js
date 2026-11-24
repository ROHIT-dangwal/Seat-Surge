import { Router } from 'express';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import pool from '../db.js';
import { acquireSeatLock } from '../lock.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const HOLD_TTL_SECONDS = Number(process.env.SEAT_HOLD_TTL_SECONDS ?? 300);

router.post('/events/:eventId/seats/:seatId/hold', requireAuth, async (req, res) => {
  const { seatId } = req.params;
  const idempotencyKey = req.headers['idempotency-key'] ?? crypto.randomUUID();

  const existing = await pool.query('SELECT id, payment_code FROM orders WHERE idempotency_key = $1', [
    idempotencyKey,
  ]);
  if (existing.rows[0]) {
    return respondWithOrder(res, existing.rows[0].id);
  }

  const gotLock = await acquireSeatLock(seatId, req.userId);
  if (!gotLock) {
    return res.status(409).json({ error: 'seat_locked_try_again' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const seatResult = await client.query(
      "SELECT status FROM seats WHERE id = $1 FOR UPDATE",
      [seatId]
    );
    const seat = seatResult.rows[0];
    if (!seat) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'seat_not_found' });
    }
    if (seat.status !== 'available') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'seat_not_available' });
    }

    const paymentCode = crypto.randomBytes(16).toString('hex');

    await client.query(
      "UPDATE seats SET status = 'held', held_until = now() + ($1 || ' seconds')::interval WHERE id = $2",
      [HOLD_TTL_SECONDS, seatId]
    );

    const orderResult = await client.query(
      `INSERT INTO orders (seat_id, user_id, status, payment_code, idempotency_key)
       VALUES ($1, $2, 'pending_payment', $3, $4)
       RETURNING id`,
      [seatId, req.userId, paymentCode, idempotencyKey]
    );

    await client.query('COMMIT');
    return respondWithOrder(res, orderResult.rows[0].id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

async function respondWithOrder(res, orderId) {
  const result = await pool.query(
    `SELECT o.id, o.status, o.payment_code, o.created_at, s.seat_label, s.held_until
     FROM orders o JOIN seats s ON s.id = o.seat_id
     WHERE o.id = $1`,
    [orderId]
  );
  const order = result.rows[0];
  const payUrl = `${process.env.PUBLIC_BASE_URL}/pay/${order.payment_code}`;
  const paymentQr = await QRCode.toDataURL(payUrl);

  res.status(200).json({
    order: {
      id: order.id,
      status: order.status,
      seatLabel: order.seat_label,
      heldUntil: order.held_until,
      paymentCode: order.payment_code,
    },
    paymentQr,
  });
}

export default router;
