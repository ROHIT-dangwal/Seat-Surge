const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';

async function request(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));

  if (res.status === 401 && token) {
    localStorage.removeItem('seatsurge_token');
    window.location.reload();
    return new Promise(() => {}); // reload is in flight; don't resolve into stale UI code
  }

  if (!res.ok) {
    throw new Error(data.error ?? `request_failed_${res.status}`);
  }
  return data;
}

export const api = {
  signup: (email, password) => request('/signup', { method: 'POST', body: { email, password } }),
  login: (email, password) => request('/login', { method: 'POST', body: { email, password } }),
  listEvents: () => request('/events'),
  listSeats: (eventId) => request(`/events/${eventId}/seats`),
  holdSeat: (eventId, seatId, token) =>
    request(`/events/${eventId}/seats/${seatId}/hold`, { method: 'POST', token }),
  getOrder: (orderId, token) => request(`/orders/${orderId}`, { token }),
  confirmPayment: (paymentCode) => request(`/pay/${paymentCode}/confirm`, { method: 'POST' }),
  getTicket: (orderId, token) => request(`/orders/${orderId}/ticket`, { token }),
  validateTicket: (ticketCode) => request('/tickets/validate', { method: 'POST', body: { ticketCode } }),
};

export { API_BASE };
