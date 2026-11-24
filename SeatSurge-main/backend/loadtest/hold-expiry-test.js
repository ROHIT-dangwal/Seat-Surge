import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const HOLD_COUNT = Number(__ENV.HOLD_COUNT || 50);
const HOLD_TTL_SECONDS = Number(__ENV.HOLD_TTL_SECONDS || 300);
const SWEEP_BUFFER_SECONDS = 40;

const tokens = new SharedArray('tokens', function () {
  return JSON.parse(open('./tokens.json')).slice(0, HOLD_COUNT);
});

export const options = {
  scenarios: {
    place_holds: {
      executor: 'shared-iterations',
      vus: tokens.length,
      iterations: tokens.length,
      maxDuration: '30s',
      exec: 'placeHold',
    },
    verify_release: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      startTime: `${HOLD_TTL_SECONDS + SWEEP_BUFFER_SECONDS}s`,
      exec: 'verifyReleased',
    },
  },
};

export function setup() {
  const res = http.get(`${BASE_URL}/events`);
  const eventId = res.json('events.0.id');
  const available = http
    .get(`${BASE_URL}/events/${eventId}/seats`)
    .json('seats')
    .filter((s) => s.status === 'available');
  const seatIds = available.slice(0, tokens.length).map((s) => s.id);
  return { eventId, seatIds };
}

export function placeHold(data) {
  const token = tokens[__VU - 1];
  const seatId = data.seatIds[__VU - 1];
  const res = http.post(`${BASE_URL}/events/${data.eventId}/seats/${seatId}/hold`, null, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check(res, { 'hold succeeded': (r) => r.status === 200 });
  // Deliberately never confirm — this is the point of the test.
}

export function verifyReleased(data) {
  const seats = http.get(`${BASE_URL}/events/${data.eventId}/seats`).json('seats');
  const targeted = seats.filter((s) => data.seatIds.includes(s.id));
  const releasedCount = targeted.filter((s) => s.status === 'available').length;

  check(releasedCount, {
    'every abandoned hold was released back to available': (n) => n === data.seatIds.length,
  });
}
