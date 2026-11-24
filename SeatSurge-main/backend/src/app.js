import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import eventRoutes from './routes/events.js';
import seatRoutes from './routes/seats.js';
import payRoutes from './routes/pay.js';
import ticketRoutes from './routes/tickets.js';

const app = express();
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN ?? true,
  })
);
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

app.use(authRoutes);
app.use(eventRoutes);
app.use(seatRoutes);
app.use(payRoutes);
app.use(ticketRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

export default app;
