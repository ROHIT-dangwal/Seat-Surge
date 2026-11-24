import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

const tokens = new SharedArray('tokens', function () {
  return JSON.parse(open('./tokens.json'));
});

export const options = {
  scenarios: {
    flash_sale: {
      executor: 'shared-iterations',
      vus: tokens.length,
      iterations: tokens.length,
      maxDuration: '60s',
    },
  },
};

let eventId;
let seatIds;

export function setup() {
  const res = http.get(`${BASE_URL}/events`);
  eventId = res.json('events.0.id');
  const seatsRes = http.get(`${BASE_URL}/events/${eventId}/seats`);
  seatIds = seatsRes.json('seats').map((s) => s.id);
  return { eventId, seatIds };
}

export default function (data) {
  const token = tokens[__VU - 1];
  const seatId = data.seatIds[Math.floor(Math.random() * data.seatIds.length)];

  const res = http.post(`${BASE_URL}/events/${data.eventId}/seats/${seatId}/hold`, null, {
    headers: { Authorization: `Bearer ${token}` },
  });

  check(res, {
    'is 200 or 409': (r) => r.status === 200 || r.status === 409,
    'no 5xx': (r) => r.status < 500,
  });
}
