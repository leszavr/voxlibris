#!/usr/bin/env node

import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.YOOKASSA_EMULATOR_PORT || 4010);
const HOST = process.env.YOOKASSA_EMULATOR_HOST || '127.0.0.1';
const PUBLIC_URL = process.env.YOOKASSA_EMULATOR_PUBLIC_URL || `http://${HOST}:${PORT}`;
const WEBHOOK_URL = process.env.YOOKASSA_EMULATOR_WEBHOOK_URL || 'http://127.0.0.1:5000/api/commerce/webhooks/yookassa';

const payments = new Map();
const receipts = new Map();

function json(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function html(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({ raw, body: {} });
      try {
        resolve({ raw, body: JSON.parse(raw) });
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function paymentResponse(payment) {
  return {
    id: payment.id,
    status: payment.status,
    paid: payment.status === 'succeeded',
    amount: payment.amount,
    description: payment.description,
    confirmation: {
      type: 'redirect',
      confirmation_url: `${PUBLIC_URL}/pay/${payment.id}`,
    },
    payment_method: payment.paymentMethodId ? { id: payment.paymentMethodId, saved: true } : undefined,
    metadata: payment.metadata,
    receipt_registration: payment.receiptId ? 'succeeded' : undefined,
  };
}

function paymentReturnUrl(payment, status) {
  const raw = payment.returnUrl || 'http://localhost:3000/payment/success';
  const url = new URL(raw);
  url.searchParams.set('paymentId', payment.id);
  url.searchParams.set('status', status);
  if (payment.receiptId) url.searchParams.set('receiptUrl', `${PUBLIC_URL}/receipts/${payment.receiptId}`);
  return url.toString();
}

function createReceipt(payment) {
  if (payment.receiptId) return receipts.get(payment.receiptId);
  const receipt = {
    id: `emul_receipt_${crypto.randomUUID()}`,
    status: 'succeeded',
    type: 'payment',
    payment_id: payment.id,
    amount: payment.amount,
    fiscal_document_number: String(Math.floor(100000 + Math.random() * 900000)),
    fiscal_storage_number: '9999078900000001',
    fiscal_attribute: String(Math.floor(1000000000 + Math.random() * 9000000000)),
    registered_at: new Date().toISOString(),
  };
  receipt.receipt_url = `${PUBLIC_URL}/receipts/${receipt.id}`;
  receipts.set(receipt.id, receipt);
  payment.receiptId = receipt.id;
  payment.metadata = {
    ...payment.metadata,
    fiscalReceiptId: receipt.id,
    fiscalReceiptUrl: receipt.receipt_url,
  };
  return receipt;
}

async function sendWebhook(payment, event = 'payment.succeeded') {
  const receipt = payment.status === 'succeeded' ? createReceipt(payment) : null;
  const payload = {
    type: 'notification',
    event,
    object: {
      id: payment.id,
      status: payment.status,
      paid: payment.status === 'succeeded',
      amount: payment.amount,
      description: payment.description,
      metadata: payment.metadata,
      payment_method: { id: payment.paymentMethodId },
      receipt_registration: receipt ? 'succeeded' : undefined,
    },
  };
  const response = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Yookassa-Emulator': 'true' },
    body: JSON.stringify(payload),
  });
  return { ok: response.ok, status: response.status, text: await response.text() };
}

function page(payment, message = '', returnUrl = '') {
  const receipt = payment.receiptId ? receipts.get(payment.receiptId) : null;
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>YooKassa emulator</title>
${returnUrl ? `<meta http-equiv="refresh" content="3;url=${escapeHtml(returnUrl)}">` : ''}
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;line-height:1.5}code,pre{background:#f3f4f6;padding:2px 5px;border-radius:4px}button,.button{display:inline-block;padding:10px 14px;margin:4px;border:0;border-radius:8px;background:#111827;color:white;cursor:pointer;text-decoration:none}.warn{padding:12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px}.ok{padding:12px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px}.bad{padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px}</style>
</head><body>
<h1>YooKassa emulator</h1>
<p class="warn">DEV ONLY. Это не настоящая YooKassa и не фискальный документ 54-ФЗ.</p>
${message ? `<p class="${payment.status === 'succeeded' ? 'ok' : 'bad'}">${message}</p>` : ''}
<h2>Платёж</h2>
<p>ID: <code>${payment.id}</code></p>
<p>Статус: <code>${payment.status}</code></p>
<p>Сумма: <code>${payment.amount.value} ${payment.amount.currency}</code></p>
<p>Order ID: <code>${payment.metadata?.orderId || '-'}</code></p>
<form method="post" action="/pay/${payment.id}/success"><button>Успешно оплатить</button></form>
<form method="post" action="/pay/${payment.id}/cancel"><button>Отменить</button></form>
<form method="post" action="/pay/${payment.id}/repeat"><button>Повторить webhook</button></form>
${receipt ? `<h2>Fake 54-ФЗ receipt</h2><p>ID: <code>${receipt.id}</code></p><p><a href="${receipt.receipt_url}">Открыть fake receipt</a></p>` : ''}
${returnUrl ? `<p>Через 3 секунды вернём вас в VoxLibris.</p><p><a class="button" href="${escapeHtml(returnUrl)}">Вернуться сейчас</a></p>` : ''}
<h2>JSON</h2><pre>${escapeHtml(JSON.stringify(paymentResponse(payment), null, 2))}</pre>
</body></html>`;
}

function receiptPage(receipt) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Fake receipt</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.5}.warn{padding:12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px}code{background:#f3f4f6;padding:2px 5px;border-radius:4px}</style></head><body>
<h1>Эмулятор фискального чека</h1><p class="warn">DEV ONLY. Не является фискальным документом.</p>
<p>Receipt ID: <code>${receipt.id}</code></p><p>Payment ID: <code>${receipt.payment_id}</code></p><p>Статус: <code>${receipt.status}</code></p>
<p>Сумма: <code>${receipt.amount.value} ${receipt.amount.currency}</code></p><p>ФН: <code>${receipt.fiscal_storage_number}</code></p><p>ФД: <code>${receipt.fiscal_document_number}</code></p><p>ФПД: <code>${receipt.fiscal_attribute}</code></p><p>Дата: <code>${receipt.registered_at}</code></p>
</body></html>`;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', PUBLIC_URL);

    if (req.method === 'GET' && url.pathname === '/') {
      return html(res, 200, `<h1>YooKassa emulator</h1><p>Payments: ${payments.size}</p><p>Webhook: <code>${WEBHOOK_URL}</code></p>`);
    }

    if (req.method === 'POST' && url.pathname === '/v3/payments') {
      const { body } = await readBody(req);
      const id = `emul_payment_${crypto.randomUUID()}`;
      const payment = {
        id,
        status: 'pending',
        amount: body.amount || { value: '0.00', currency: 'RUB' },
        description: body.description || 'Emulated payment',
        metadata: body.metadata || {},
        returnUrl: body.confirmation?.return_url,
        receiptRequest: body.receipt,
        paymentMethodId: `emul_pm_${crypto.randomUUID()}`,
        createdAt: new Date().toISOString(),
      };
      payments.set(id, payment);
      return json(res, 200, paymentResponse(payment));
    }

    const paymentGet = url.pathname.match(/^\/v3\/payments\/(.+)$/);
    if (req.method === 'GET' && paymentGet) {
      const payment = payments.get(decodeURIComponent(paymentGet[1]));
      return payment ? json(res, 200, paymentResponse(payment)) : json(res, 404, { type: 'error', description: 'Payment not found' });
    }

    const payPage = url.pathname.match(/^\/pay\/(.+)$/);
    if (req.method === 'GET' && payPage) {
      const payment = payments.get(decodeURIComponent(payPage[1]));
      return payment ? html(res, 200, page(payment)) : html(res, 404, '<h1>Payment not found</h1>');
    }

    const payAction = url.pathname.match(/^\/pay\/(.+)\/(success|cancel|repeat)$/);
    if (req.method === 'POST' && payAction) {
      const payment = payments.get(decodeURIComponent(payAction[1]));
      if (!payment) return html(res, 404, '<h1>Payment not found</h1>');
      const action = payAction[2];
      if (action === 'success') payment.status = 'succeeded';
      if (action === 'cancel') payment.status = 'canceled';
      const event = payment.status === 'succeeded' ? 'payment.succeeded' : 'payment.canceled';
      const result = await sendWebhook(payment, event);
      const status = payment.status === 'succeeded' && result.ok ? 'success' : 'failed';
      const returnUrl = paymentReturnUrl(payment, status);
      const message = status === 'success'
        ? `Оплата успешно эмулирована. Webhook отправлен: HTTP ${result.status}`
        : `Оплата не завершена. Webhook отправлен: HTTP ${result.status}`;
      return html(res, 200, page(payment, message, returnUrl));
    }

    const receiptGet = url.pathname.match(/^\/receipts\/(.+)$/);
    if (req.method === 'GET' && receiptGet) {
      const receipt = receipts.get(decodeURIComponent(receiptGet[1]));
      return receipt ? html(res, 200, receiptPage(receipt)) : html(res, 404, '<h1>Receipt not found</h1>');
    }

    return json(res, 404, { type: 'error', description: 'Not found' });
  } catch (error) {
    console.error(error);
    return json(res, 500, { type: 'error', description: error instanceof Error ? error.message : 'Unknown error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`YooKassa emulator: ${PUBLIC_URL}`);
  console.log(`Webhook target: ${WEBHOOK_URL}`);
});
