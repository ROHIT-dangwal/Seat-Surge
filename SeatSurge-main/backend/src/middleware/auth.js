import jwt from 'jsonwebtoken';
import pool from '../db.js';

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing_token' });
  }

  const token = header.slice('Bearer '.length);
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }

  const result = await pool.query('SELECT id FROM users WHERE id = $1', [payload.sub]);
  if (!result.rows[0]) {
    return res.status(401).json({ error: 'user_no_longer_exists' });
  }

  req.userId = payload.sub;
  next();
}

export function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'admin_token_required' });
  }
  next();
}
