import '../src/env.js';
import pool from '../src/db.js';

async function reset() {
  await pool.query('TRUNCATE orders, seats, events, users RESTART IDENTITY CASCADE');
  console.log('Reset: orders, seats, events, users truncated');
  await pool.end();
}

reset().catch((err) => {
  console.error(err);
  process.exit(1);
});
