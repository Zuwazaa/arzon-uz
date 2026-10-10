import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
process.env.DB_FILE = ':memory:';
process.env.RATE_LIMIT_MULTIPLIER = '100';
process.env.PAYMENT_WEBHOOK_SECRET = 'test-secret';
const { app } = await import('../server/index.js');
const { seedIfEmpty } = await import('../server/seed.js');
const { sign } = await import('../server/payments.js');
const { db } = await import('../server/db.js');
seedIfEmpty();

let server, base;
before(
  () =>
    new Promise((res) => {
      server = app.listen(0, () => {
        base = `http://localhost:${server.address().port}`;
        res();
      });
    }),
);
after(() => server.close());

class Client {
  cookie = '';
  async call(method, url, body, headers = {}) {
    const r = await fetch(base + url, {
      method,
      headers: { 'content-type': 'application/json', cookie: this.cookie, ...headers },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    const sc = r.headers.get('set-cookie');
    if (sc) this.cookie = sc.split(';')[0];
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: r.status, body: json };
  }
  login = (phone) => this.call('POST', '/api/auth/login', { phone, password: 'demo12345' });
}
const pay = async (c, orderId, result = 'paid') => {
  const intent = (await c.call('POST', '/api/payments/intent', { orderId })).body;
  const ref = intent.checkoutUrl.split('/').pop();
  const p = db.prepare('SELECT * FROM payments WHERE provider_reference=?').get(ref);
  const raw = JSON.stringify({ reference: ref, status: result, amount: p.amount });
  return fetch(base + '/api/payments/webhook', { method: 'POST', body: raw, headers: { 'X-Signature': sign(Buffer.from(raw)) } });
};
async function newBuyer(phone) {
  const c = new Client();
  const r = await c.call('POST', '/api/auth/register', { name: 'Test ' + phone, phone, password: 'password123' });
  assert.equal(r.status, 201);
  await c.call('POST', '/api/me/addresses', { label: 'Uy', zoneId: 1, street: 'Test kocha 1' });
  const a = (await c.call('GET', '/api/me/addresses')).body[0];
  return { c, addressId: a.id };
}

test('individual order: min qty, snapshot, webhook-only payment', async () => {
  const { c, addressId } = await newBuyer('+998901111111');
  const prod = (await c.call('GET', '/api/products')).body.items.find((p) => p.title.startsWith('Guruch'));
  let r = await c.call('POST', '/api/orders/individual', { productId: prod.id, qty: 5, addressId });
  assert.equal(r.status, 422);
  assert.equal(r.body.error.code, 'below_min');
  r = await c.call('POST', '/api/orders/individual', { productId: prod.id, qty: 100, addressId }, { 'Idempotency-Key': 'k1' });
  assert.equal(r.status, 201);
  assert.equal(r.body.order.items[0].unitPrice, 15500);
  assert.equal(r.body.order.total, 100 * 15500 + 15000);
  const again = await c.call('POST', '/api/orders/individual', { productId: prod.id, qty: 100, addressId }, { 'Idempotency-Key': 'k1' });
  assert.equal(again.body.orderId, r.body.orderId);
  const id = r.body.orderId;
  const bad = await fetch(base + '/api/payments/webhook', { method: 'POST', body: '{"reference":"x"}', headers: { 'X-Signature': 'nope' } });
  assert.equal(bad.status, 401);
  assert.equal((await c.call('GET', `/api/orders/${id}`)).body.status, 'pending_payment');
  assert.equal((await pay(c, id)).status, 200);
  const o = (await c.call('GET', `/api/orders/${id}`)).body;
  assert.equal(o.status, 'confirmed');
  assert.equal(o.payment.status, 'paid');
  db.prepare('UPDATE price_tiers SET unit_price=1 WHERE product_id=? AND min_qty=100').run(prod.id);
  assert.equal((await c.call('GET', `/api/orders/${id}`)).body.total, 100 * 15500 + 15000);
  db.prepare('UPDATE price_tiers SET unit_price=15500 WHERE product_id=? AND min_qty=100').run(prod.id);
  const other = await newBuyer('+998902222222');
  assert.equal((await other.c.call('GET', `/api/orders/${id}`)).status, 404);
});

test('stock cannot be oversold under concurrent orders', async () => {
  const { c, addressId } = await newBuyer('+998903333333');
  const prod = db.prepare("SELECT id FROM products WHERE title LIKE 'Kir yuvish%'").get();
  db.prepare('UPDATE products SET stock_qty=10 WHERE id=?').run(prod.id);
  const rs = await Promise.all(
    [1, 2, 3, 4, 5].map((i) => c.call('POST', '/api/orders/individual', { productId: prod.id, qty: 4, addressId }, { 'Idempotency-Key': 'c' + i })),
  );
  assert.equal(rs.filter((r) => r.status === 201).length, 2);
  assert.equal(db.prepare('SELECT stock_qty FROM products WHERE id=?').get(prod.id).stock_qty, 2);
});

test('group: concurrent joins respect limit; success adjusts price; seller gate', async () => {
  const g = db.prepare('SELECT * FROM group_buys WHERE target_qty=60').get(); // oil, tiers 6/24/60
  const buyers = [];
  for (let i = 0; i < 4; i++) buyers.push(await newBuyer('+99890444444' + i));
  const rs = await Promise.all(
    buyers.map((b, i) => b.c.call('POST', `/api/groups/${g.id}/join`, { qty: 24, addressId: b.addressId }, { 'Idempotency-Key': 'g' + i })),
  );
  const ok = rs.filter((r) => r.status === 201);
  assert.equal(ok.length, 2);
  assert.ok(rs.filter((r) => r.status === 422).every((r) => r.body.error.code === 'exceeds_group'));
  const idx = buyers.map((_, i) => i).filter((i) => rs[i].status === 201);
  const [a, b] = idx.map((i) => buyers[i]);
  const [oa, ob] = idx.map((i) => rs[i].body.orderId);
  assert.equal((await a.c.call('POST', `/api/groups/${g.id}/join`, { qty: 6, addressId: a.addressId })).status, 409);
  await pay(a.c, oa);
  let o = (await a.c.call('GET', `/api/orders/${oa}`)).body;
  assert.equal(o.waitingForGroup, true);
  const seller = new Client();
  await seller.login('+998900000003');
  const sr = await seller.call('PATCH', `/api/seller/orders/${oa}/status`, { status: 'preparing' });
  assert.equal(sr.status, 409);
  assert.equal(sr.body.error.code, 'group_not_ready');
  const lastIdx = buyers.map((_, i) => i).find((i) => !idx.includes(i));
  const last = buyers[lastIdx];
  const jl = await last.c.call('POST', `/api/groups/${g.id}/join`, { qty: 12, addressId: last.addressId });
  assert.equal(jl.status, 201);
  assert.equal((await last.c.call('GET', `/api/groups/${g.id}`)).body.status, 'threshold_met');
  await pay(b.c, ob);
  await pay(last.c, jl.body.orderId);
  const gd = (await last.c.call('GET', `/api/groups/${g.id}`)).body;
  assert.equal(gd.status, 'successful');
  o = (await a.c.call('GET', `/api/orders/${oa}`)).body;
  assert.equal(o.items[0].unitPrice, 63500);
  assert.equal(o.payment.refundStatus, 'refund_pending');
  assert.ok(o.payment.refundAmount > 0);
  assert.equal((await seller.call('PATCH', `/api/seller/orders/${oa}/status`, { status: 'preparing' })).status, 200);
  const s1 = new Client();
  await s1.login('+998900000002');
  assert.equal((await s1.call('PATCH', `/api/seller/orders/${oa}/status`, { status: 'ready_for_delivery' })).status, 404);
  assert.equal((await buyers[0].c.call('POST', `/api/groups/${g.id}/join`, { qty: 6, addressId: buyers[0].addressId })).status, 422);
});

test('group expiry -> failed, paid members refunded, reserved released', async () => {
  const g = db.prepare('SELECT * FROM group_buys WHERE target_qty=50').get(); // soap
  db.prepare('UPDATE products SET stock_qty=800 WHERE id=?').run(g.product_id);
  const b1 = await newBuyer('+998905555551');
  const b2 = await newBuyer('+998905555552');
  const j1 = await b1.c.call('POST', `/api/groups/${g.id}/join`, { qty: 10, addressId: b1.addressId });
  const j2 = await b2.c.call('POST', `/api/groups/${g.id}/join`, { qty: 10, addressId: b2.addressId });
  await pay(b1.c, j1.body.orderId);
  const stockBefore = db.prepare('SELECT stock_qty FROM products WHERE id=?').get(g.product_id).stock_qty;
  db.prepare('UPDATE group_buys SET ends_at=? WHERE id=?').run(new Date(Date.now() - 1000).toISOString(), g.id);
  const gd = (await b1.c.call('GET', `/api/groups/${g.id}`)).body;
  assert.equal(gd.status, 'failed');
  const o1 = (await b1.c.call('GET', `/api/orders/${j1.body.orderId}`)).body;
  assert.equal(o1.status, 'cancelled');
  assert.equal(o1.payment.status, 'refund_pending');
  assert.equal((await b2.c.call('GET', `/api/orders/${j2.body.orderId}`)).body.status, 'cancelled');
  assert.equal(db.prepare('SELECT stock_qty FROM products WHERE id=?').get(g.product_id).stock_qty, stockBefore + 20);
  const admin = new Client();
  await admin.login('+998900000001');
  const rf = await admin.call('POST', `/api/admin/orders/${o1.id}/refund`, { action: 'complete' });
  assert.equal(rf.status, 200);
  assert.equal(rf.body.payment.status, 'refunded');
});

test('delivery lifecycle + role checks + stats', async () => {
  const { c, addressId } = await newBuyer('+998906666666');
  const prod = db.prepare("SELECT id FROM products WHERE title LIKE 'Un %'").get();
  const r = await c.call('POST', '/api/orders/individual', { productId: prod.id, qty: 50, addressId });
  const id = r.body.orderId;
  await pay(c, id);
  assert.equal((await c.call('GET', '/api/admin/orders')).status, 403);
  const seller = new Client();
  await seller.login('+998900000002');
  await seller.call('PATCH', `/api/seller/orders/${id}/status`, { status: 'preparing' });
  await seller.call('PATCH', `/api/seller/orders/${id}/status`, { status: 'ready_for_delivery' });
  const admin = new Client();
  await admin.login('+998900000001');
  const d = db.prepare('SELECT id FROM deliveries WHERE order_id=?').get(id);
  assert.equal((await admin.call('PATCH', `/api/admin/deliveries/${d.id}`, { status: 'delivered' })).status, 409);
  const when = new Date(Date.now() + 3600e3).toISOString();
  assert.equal((await admin.call('PATCH', `/api/admin/deliveries/${d.id}`, { status: 'scheduled', scheduledAt: when, courier: 'Ali' })).status, 200);
  assert.equal((await admin.call('PATCH', `/api/admin/deliveries/${d.id}`, { status: 'out_for_delivery' })).status, 200);
  assert.equal((await admin.call('PATCH', `/api/admin/deliveries/${d.id}`, { status: 'delivered', actualCost: 9000 })).status, 200);
  assert.equal((await c.call('GET', `/api/orders/${id}`)).body.status, 'delivered');
  const st = (await admin.call('GET', '/api/admin/stats')).body;
  assert.equal(st.deliveredOrders, 1);
  assert.equal(st.deliveryCostPerOrder, 9000);
  assert.ok(st.groupCompletionRate !== null);
});
