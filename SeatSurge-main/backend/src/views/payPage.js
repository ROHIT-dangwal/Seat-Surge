function shell(bodyHtml) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SeatSurge — Confirm payment</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: #f4f5f9;
        font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
        color: #0f172a;
      }
      .card {
        width: 100%;
        max-width: 360px;
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 20px;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
        padding: 32px 28px;
        text-align: center;
      }
      .eyebrow {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #94a3b8;
        margin: 0 0 6px;
      }
      h1 { font-size: 22px; font-weight: 800; margin: 0 0 4px; }
      .subtitle { font-size: 14px; color: #64748b; margin: 0 0 24px; }
      .amount { font-size: 13px; color: #475569; margin: 0 0 24px; }
      button {
        width: 100%;
        border: none;
        border-radius: 12px;
        padding: 14px 16px;
        font-family: inherit;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s ease;
      }
      .primary { background: #4f46e5; color: #fff; }
      .primary:hover { background: #4338ca; }
      .primary:disabled { background: #a5b4fc; cursor: not-allowed; }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        font-weight: 600;
        padding: 6px 14px;
        border-radius: 999px;
        margin-bottom: 16px;
      }
      .badge.success { background: #ecfdf5; color: #047857; }
      .badge.error { background: #fef2f2; color: #dc2626; }
      .badge.muted { background: #f1f5f9; color: #64748b; }
      .ticket-code {
        margin-top: 16px;
        font-family: 'SFMono-Regular', Menlo, Consolas, monospace;
        font-size: 13px;
        background: #f8fafc;
        border-radius: 10px;
        padding: 10px 14px;
        word-break: break-all;
        color: #334155;
      }
      .message { font-size: 14px; margin-top: 16px; }
      .message.error { color: #dc2626; }
    </style>
  </head>
  <body>
    <div class="card">
      <p class="eyebrow">SeatSurge</p>
      ${bodyHtml}
    </div>
  </body>
</html>`;
}

export function notFoundPage() {
  return shell(`
    <span class="badge error">Not found</span>
    <h1>Payment link not found</h1>
    <p class="subtitle">This link doesn't match any reservation.</p>
  `);
}

export function alreadyProcessedPage(status) {
  const isConfirmed = status === 'confirmed';
  return shell(`
    <span class="badge ${isConfirmed ? 'success' : 'muted'}">${status.replace('_', ' ')}</span>
    <h1>${isConfirmed ? 'Already confirmed' : 'No longer available'}</h1>
    <p class="subtitle">
      ${isConfirmed ? 'This order was already paid for.' : `This order is ${status.replace('_', ' ')}.`}
    </p>
  `);
}

export function confirmPage({ eventName, seatLabel }) {
  return shell(`
    <h1>Confirm payment</h1>
    <p class="subtitle">Scan complete — approve to finish your purchase.</p>
    <p class="amount">${eventName} &middot; Seat ${seatLabel}</p>
    <button id="confirm" class="primary">Confirm Payment</button>
    <p id="result" class="message"></p>
    <script>
      const btn = document.getElementById('confirm');
      const result = document.getElementById('result');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Confirming…';
        try {
          const res = await fetch(window.location.pathname + '/confirm', { method: 'POST' });
          const body = await res.json();
          if (res.ok) {
            document.querySelector('.card').innerHTML =
              '<p class="eyebrow">SeatSurge</p>' +
              '<span class="badge success">Confirmed</span>' +
              '<h1>Payment confirmed</h1>' +
              '<p class="subtitle">Your seat is booked.</p>' +
              '<div class="ticket-code">' + body.ticketCode + '</div>';
          } else {
            result.textContent = 'Error: ' + body.error.replaceAll('_', ' ');
            result.className = 'message error';
            btn.disabled = false;
            btn.textContent = 'Confirm Payment';
          }
        } catch {
          result.textContent = 'Network error — please try again.';
          result.className = 'message error';
          btn.disabled = false;
          btn.textContent = 'Confirm Payment';
        }
      });
    </script>
  `);
}
