import '../src/env.js';
import pool from '../src/db.js';
import { runMigrations } from '../src/migrate.js';

runMigrations()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
