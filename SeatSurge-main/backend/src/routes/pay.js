import { Router } from 'express';
import crypto from 'node:crypto';
import pool from '../db.js';
import { acquireSeatLock } from '../lock.js';
import { notFoundPage, alreadyProcessedPage, confirmPage } from '../views/payPage.js';

const router = Router();

router.get('/pay/:paymentCode', async (req, res) => {
  const result = await pool.query(
    `SELECT o.id, o.status, s.seat_label, e.name AS event_name
     FROM orders o
     JOIN seats s ON s.id = o.seat_id
     JOIN events e ON e.id = s.event_id
     WHERE o.payment_code = $1`,
    [req.params.paymentCode]
  );
  const order = result.rows[0];
  if (!order) {
    return res.status(404).send(notFoundPage());
  }

  if (order.status !== 'pending_payment') {
    return res.send(alreadyProcessedPage(order.status));
  }

  res.send(confirmPage({ eventName: order.event_name, seatLabel: order.seat_label }));
});

router.post('/pay/:paymentCode/confirm', async (req, res) => {
  const { paymentCode } = req.params;

  const orderLookup = await pool.query('SELECT id, seat_id, status FROM orders WHERE payment_code = $1', [
    paymentCode,
  ]);
  const order = orderLookup.rows[0];
  if (!order) {
    return res.status(404).json({ error: 'order_not_found' });
  }

  if (order.status === 'confirmed') {
    const ticket = await pool.query('SELECT ticket_code FROM orders WHERE id = $1', [order.id]);
    return res.status(200).json({ ticketCode: ticket.rows[0].ticket_code });
  }
  if (order.status !== 'pending_payment') {
    return res.status(410).json({ error: 'order_not_pending' });
  }

  const gotLock = await acquireSeatLock(order.seat_id, `confirm:${order.id}`);
  if (!gotLock) {
    return res.status(409).json({ error: 'seat_locked_try_again' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const seatResult = await client.query(
      "SELECT status, held_until FROM seats WHERE id = $1 FOR UPDATE",
      [order.seat_id]
    );
    const seat = seatResult.rows[0];

    if (seat.status !== 'held' || !seat.held_until || new Date(seat.held_until) < new Date()) {
      await client.query('ROLLBACK');
      return res.status(410).json({ error: 'reservation_expired' });
    }

    const ticketCode = crypto.randomBytes(16).toString('hex');

    await client.query("UPDATE seats SET status = 'sold', held_until = NULL WHERE id = $1", [order.seat_id]);
    await client.query(
      "UPDATE orders SET status = 'confirmed', ticket_code = $1 WHERE id = $2",
      [ticketCode, order.id]
    );

    await client.query('COMMIT');
    return res.status(200).json({ ticketCode });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

export default router;
