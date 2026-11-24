import fs from 'node:fs';
import path from 'node:path';
import pool from './db.js';

const migrationsDir = path.resolve(import.meta.dirname, '../migrations');

export async function runMigrations() {
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`Running ${file}...`);
    await pool.query(sql);
  }
  console.log('Migrations complete');
}
