import pool from '../db.js';

const SWEEP_INTERVAL_MS = 30_000;

async function sweepExpiredHolds() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const expiredSeats = await client.query(
      `UPDATE seats SET status = 'available', held_until = NULL
       WHERE status = 'held' AND held_until < now()
       RETURNING id`
    );
    if (expiredSeats.rows.length > 0) {
      const seatIds = expiredSeats.rows.map((row) => row.id);
      await client.query(
        `UPDATE orders SET status = 'expired'
         WHERE seat_id = ANY($1::uuid[]) AND status = 'pending_payment'`,
        [seatIds]
      );
      console.log(`sweep: released ${seatIds.length} expired hold(s)`);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('sweep failed', err);
  } finally {
    client.release();
  }
}

export function startSweepJob() {
  setInterval(sweepExpiredHolds, SWEEP_INTERVAL_MS);
}
