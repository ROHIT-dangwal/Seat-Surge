import { Router } from 'express';
import pool from '../db.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/events', async (req, res) => {
  const result = await pool.query('SELECT id, name, event_time FROM events ORDER BY event_time');
  res.json({ events: result.rows });
});

router.post('/events', requireAdmin, async (req, res) => {
  const { name, eventTime, seatCount } = req.body;
  if (!name || !eventTime || !seatCount || seatCount < 1) {
    return res.status(400).json({ error: 'name_eventTime_seatCount_required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const eventResult = await client.query(
      'INSERT INTO events (name, event_time) VALUES ($1, $2) RETURNING id',
      [name, eventTime]
    );
    const eventId = eventResult.rows[0].id;

    const params = [];
    const values = [];
    for (let i = 1; i <= seatCount; i++) {
      params.push(eventId, `A${i}`);
      values.push(`($${params.length - 1}, $${params.length})`);
    }
    await client.query(`INSERT INTO seats (event_id, seat_label) VALUES ${values.join(', ')}`, params);

    await client.query('COMMIT');
    res.status(201).json({ id: eventId, name, eventTime, seatCount });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.get('/events/:eventId/seats', async (req, res) => {
  const result = await pool.query(
    'SELECT id, seat_label, status FROM seats WHERE event_id = $1 ORDER BY seat_label',
    [req.params.eventId]
  );
  res.json({ seats: result.rows });
});

export default router;
