import { Router } from 'express';
import pool from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/orders/:id', requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT o.status, o.ticket_code, s.seat_label
     FROM orders o JOIN seats s ON s.id = o.seat_id
     WHERE o.id = $1 AND o.user_id = $2`,
    [req.params.id, req.userId]
  );
  const order = result.rows[0];
  if (!order) {
    return res.status(404).json({ error: 'order_not_found' });
  }
  res.json({ status: order.status, ticketCode: order.ticket_code, seatLabel: order.seat_label });
});

router.get('/orders/:id/ticket', requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT o.status, o.ticket_code, o.is_redeemed, s.seat_label
     FROM orders o JOIN seats s ON s.id = o.seat_id
     WHERE o.id = $1 AND o.user_id = $2`,
    [req.params.id, req.userId]
  );
  const order = result.rows[0];
  if (!order) {
    return res.status(404).json({ error: 'order_not_found' });
  }
  if (order.status !== 'confirmed') {
    return res.status(409).json({ error: 'order_not_confirmed' });
  }

  res.json({
    ticketCode: order.ticket_code,
    seatLabel: order.seat_label,
    isRedeemed: order.is_redeemed,
  });
});

router.post('/tickets/validate', async (req, res) => {
  const { ticketCode } = req.body;
  if (!ticketCode) {
    return res.status(400).json({ error: 'ticket_code_required' });
  }

  const result = await pool.query(
    `UPDATE orders SET is_redeemed = true
     WHERE ticket_code = $1 AND is_redeemed = false
     RETURNING id`,
    [ticketCode]
  );

  if (result.rows[0]) {
    return res.json({ status: 'ok' });
  }

  const existing = await pool.query('SELECT id FROM orders WHERE ticket_code = $1', [ticketCode]);
  if (!existing.rows[0]) {
    return res.status(404).json({ error: 'ticket_not_found' });
  }
  res.status(409).json({ error: 'already_used' });
});

export default router;
