import '../src/env.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../src/db.js';

const SEAT_COUNT = Number(process.argv[2] ?? 500);
const USER_COUNT = Number(process.argv[3] ?? 10000);
const BATCH_SIZE = 1000;

async function insertBatched(table, columns, rows) {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const params = [];
    const values = batch.map((row) => {
      const placeholders = row.map((value) => {
        params.push(value);
        return `$${params.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    await pool.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${values.join(', ')}`,
      params
    );
  }
}

async function seed() {
  const eventResult = await pool.query(
    "INSERT INTO events (name, event_time) VALUES ('SeatSurge Launch Show', now() + interval '30 days') RETURNING id"
  );
  const eventId = eventResult.rows[0].id;

  const seatRows = Array.from({ length: SEAT_COUNT }, (_, i) => [eventId, `A${i + 1}`]);
  await insertBatched('seats', ['event_id', 'seat_label'], seatRows);
  console.log(`Seeded event ${eventId} with ${SEAT_COUNT} seats`);

  if (USER_COUNT > 0) {
    const sharedHash = await bcrypt.hash('loadtest123', 10);
    const userRows = Array.from({ length: USER_COUNT }, (_, i) => [
      `loadtest-${i}@seatsurge.test`,
      sharedHash,
    ]);
    const insertedIds = [];
    for (let i = 0; i < userRows.length; i += BATCH_SIZE) {
      const batch = userRows.slice(i, i + BATCH_SIZE);
      const params = [];
      const values = batch.map((row) => {
        const placeholders = row.map((value) => {
          params.push(value);
          return `$${params.length}`;
        });
        return `(${placeholders.join(', ')})`;
      });
      const result = await pool.query(
        `INSERT INTO users (email, password_hash) VALUES ${values.join(', ')} RETURNING id`,
        params
      );
      insertedIds.push(...result.rows.map((r) => r.id));
    }

    const tokens = insertedIds.map((id) =>
      jwt.sign({ sub: id }, process.env.JWT_SECRET, { expiresIn: '7d' })
    );

    const outDir = path.resolve(import.meta.dirname, '../loadtest');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'tokens.json'), JSON.stringify(tokens));
    console.log(`Seeded ${USER_COUNT} test users and wrote ${outDir}/tokens.json`);
  }

  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
