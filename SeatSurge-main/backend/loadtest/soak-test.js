import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const RATE = Number(__ENV.RATE || 100);
const DURATION = __ENV.DURATION || '5m';

const tokens = new SharedArray('tokens', function () {
  return JSON.parse(open('./tokens.json'));
});

export const options = {
  scenarios: {
    soak: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: Math.min(tokens.length, RATE * 2),
      maxVUs: Math.min(tokens.length, RATE * 4),
    },
  },
};

export function setup() {
  const res = http.get(`${BASE_URL}/events`);
  const eventId = res.json('events.0.id');
  const seatIds = http
    .get(`${BASE_URL}/events/${eventId}/seats`)
    .json('seats')
    .map((s) => s.id);
  return { eventId, seatIds };
}

export default function (data) {
  const token = tokens[Math.floor(Math.random() * tokens.length)];
  const seatId = data.seatIds[Math.floor(Math.random() * data.seatIds.length)];

  const res = http.post(`${BASE_URL}/events/${data.eventId}/seats/${seatId}/hold`, null, {
    headers: { Authorization: `Bearer ${token}` },
  });

  check(res, {
    'is 200 or 409': (r) => r.status === 200 || r.status === 409,
    'no 5xx': (r) => r.status < 500,
  });
}
