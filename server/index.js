import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { attachUser } from './auth.js';
import { ApiError } from './util.js';
import { sweep } from './orders.js';
import { handleWebhook, sign, PROVIDER } from './payments.js';
import { r as publicRoutes } from './routes/public.js';
import { r as sellerRoutes } from './routes/seller.js';
import { r as adminRoutes } from './routes/admin.js';
import { seedIfEmpty } from './seed.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(here, '..', 'public');
export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '1');

app.use((_req, res, next) => {
  res.set({
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
  });
  next();
});

// Webhook needs the raw body for signature verification -> mounted before express.json
app.post('/api/payments/webhook', express.raw({ type: '*/*', limit: '16kb' }), (req, res) => {
  res.json(handleWebhook(req.body, req.get('X-Signature')));
});

app.use('/api', express.json({ limit: '100kb' }), (req, res, next) => {
  // CSRF hardening on top of SameSite=Lax: mutating calls must be JSON
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !String(req.get('content-type') || '').startsWith('application/json'))
    return next(new ApiError(415, 'json_required', 'Content-Type: application/json kerak'));
  next();
});
app.use('/api', attachUser);
app.use('/api/seller', sellerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', publicRoutes);
app.use('/api', (_req, _res, next) => next(new ApiError(404, 'not_found', 'Topilmadi')));

// ---------------- sandbox payment provider (only when PAYMENT_PROVIDER=mock)
if (PROVIDER === 'mock') {
  const page = (body) => `<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sandbox to‘lov</title><link rel="stylesheet" href="/style.css"></head><body class="mock-pay"><main class="mock-card">${body}</main></body></html>`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  app.get('/mock-pay/:ref', (req, res) => {
    const p = db.prepare('SELECT * FROM payments WHERE provider_reference=?').get(req.params.ref);
    if (!p) return res.status(404).send(page('<h1>Topilmadi</h1>'));
    const done = p.status !== 'pending';
    res.send(page(`<p class="muted">SANDBOX — haqiqiy pul yechilmaydi</p><h1>To‘lov #${p.id}</h1>
      <p class="big">${esc(new Intl.NumberFormat('uz-UZ').format(p.amount))} so‘m</p>
      ${done ? `<p>Holat: <b>${esc(p.status)}</b></p><a class="btn" href="/profile/orders/${p.order_id}">Buyurtmaga qaytish</a>` : `
      <form method="post" action="/mock-pay/${esc(p.provider_reference)}/paid"><button class="btn primary" type="submit">To‘lash (muvaffaqiyatli)</button></form>
      <form method="post" action="/mock-pay/${esc(p.provider_reference)}/failed"><button class="btn" type="submit">Rad etilsin (muvaffaqiyatsiz)</button></form>`}`));
  });
  app.post('/mock-pay/:ref/:result', (req, res) => {
    const p = db.prepare('SELECT * FROM payments WHERE provider_reference=?').get(req.params.ref);
    if (!p || !['paid', 'failed'].includes(req.params.result)) return res.status(404).end();
    // The "provider" calls our webhook with a signed server-to-server payload.
    const raw = Buffer.from(JSON.stringify({ reference: p.provider_reference, status: req.params.result, amount: p.amount }));
    handleWebhook(raw, sign(raw));
    res.redirect(303, `/profile/orders/${p.order_id}`);
  });
}

app.use(express.static(pub, { index: false, maxAge: process.env.NODE_ENV === 'production' ? '5m' : 0 }));
app.get('/{*splat}', (req, res, next) => {
  if (req.path.startsWith('/api/') || path.extname(req.path)) return next();
  res.sendFile(path.join(pub, 'index.html'));
});

app.use((err, _req, res, _next) => {
  if (err instanceof ApiError) return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'bad_json', message: 'JSON noto‘g‘ri' } });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: { code: 'too_large', message: 'So‘rov juda katta' } });
  if (String(err.message).includes('UNIQUE constraint')) return res.status(409).json({ error: { code: 'duplicate', message: 'Bunday yozuv allaqachon mavjud' } });
  console.error(err);
  res.status(500).json({ error: { code: 'server_error', message: 'Ichki xatolik' } });
});

const entry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (entry) {
  seedIfEmpty();
  setInterval(() => { try { sweep(); } catch (e) { console.error('sweep', e); } }, 30_000).unref();
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`Arzon.uz → http://localhost:${port}`));
}
