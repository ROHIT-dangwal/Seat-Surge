import redis from './redis.js';

const LOCK_TTL_MS = Number(process.env.SEAT_LOCK_TTL_MS ?? 3000);

export async function acquireSeatLock(seatId, holderId) {
  const key = `lock:seat:${seatId}`;
  const result = await redis.set(key, holderId, { NX: true, PX: LOCK_TTL_MS });
  return result === 'OK';
}
