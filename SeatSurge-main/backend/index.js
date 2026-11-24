import './src/env.js';
import app from './src/app.js';
import { startSweepJob } from './src/jobs/sweep.js';
import { runMigrations } from './src/migrate.js';

const port = process.env.PORT ?? 4000;

await runMigrations();

app.listen(port, () => {
  console.log(`SeatSurge backend listening on :${port}`);
  startSweepJob();
});
