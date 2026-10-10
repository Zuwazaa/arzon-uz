import { Router } from 'express';
import { db, tx, nowIso } from '../db.js';
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  rateLimit,
} from '../auth.js';
import {
  ApiError,
  bad,
  conflict,
  int,
  str,
  notFound,
  normalizePhone,
  oneOf,
  audit,
  unprocessable,
} from '../util.js';
import { productDto, groupDto, PRODUCT_SELECT } from '../dto.js';
import { rankProducts, matchCategories, POPULAR } from '../search.js';
import {
  quote,
  quoteDto,
  createOrder,
  orderDto,
  requireOwnedOrder,
  canBuyerCancel,
  cancelOrder,
  sweep,
} from '../orders.js';
import { createIntent } from '../payments.js';

export const r = Router();
const authLimit = rateLimit('auth', 12, 60_000);
const writeLimit = rateLimit('write', 60, 60_000);

// ------------------------------------------------------------------ auth
r.post('/auth/register', authLimit, (req, res) => {
  const name = str(req.body.name, 'Ism', { min: 2, max: 80 });
  const phone = normalizePhone(req.body.phone);
  const pw = str(req.body.password, 'Parol', { min: 8, max: 100 });
  const email = str(req.body.email, 'Email', { optional: true, max: 120 });
  const role = oneOf(req.body.role || 'buyer', ['buyer', 'seller'], 'Rol');
  const shop = role === 'seller' ? str(req.body.shopName, 'Do‘kon nomi', { min: 2, max: 80 }) : null;
  if (db.prepare('SELECT 1 FROM users WHERE phone=?').get(phone))
    throw conflict('Bu telefon raqami ro‘yxatdan o‘tgan', 'phone_taken');
  const info = db
    .prepare(
      'INSERT INTO users(name,phone,email,password_hash,role,status,shop_name,created_at) VALUES(?,?,?,?,?,?,?,?)',
    )
    .run(
      name,
      phone,
      email,
      hashPassword(pw),
      role,
      role === 'seller' ? 'pending' : 'active',
      shop,
      nowIso(),
    );
  const id = Number(info.lastInsertRowid);
  audit(id, 'user.register', 'user', id, { role });
  const s = createSession(id);
  setSessionCookie(res, s.token, s.maxAge);
  res
    .status(201)
    .json({
      user: db.prepare('SELECT id,name,phone,email,role,status,shop_name FROM users WHERE id=?').get(id),
    });
});

r.post('/auth/login', authLimit, (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const u = db.prepare('SELECT * FROM users WHERE phone=?').get(phone);
  if (!u || !verifyPassword(String(req.body.password ?? ''), u.password_hash))
    throw new ApiError(401, 'bad_credentials', 'Telefon yoki parol noto‘g‘ri');
  if (u.status === 'blocked') throw new ApiError(403, 'blocked', 'Hisob bloklangan');
  const s = createSession(u.id);
  setSessionCookie(res, s.token, s.maxAge);
  res.json({
    user: {
      id: u.id,
      name: u.name,
      phone: u.phone,
      email: u.email,
      role: u.role,
      status: u.status,
      shop_name: u.shop_name,
    },
  });
});
r.post('/auth/logout', (req, res) => {
  destroySession(req.sessionToken);
  clearSessionCookie(res);
  res.json({ ok: true });
});
r.get('/auth/me', (req, res) => res.json({ user: req.user }));

// ------------------------------------------------------------------ catalog
r.get('/categories', (_req, res) => {
  res.json(
    db
      .prepare('SELECT id,name,slug,emoji,parent_id parentId FROM categories WHERE active=1 ORDER BY id')
      .all(),
  );
});
r.get('/zones', (_req, res) => {
  res.json(db.prepare('SELECT id,name,fee FROM zones WHERE active=1 ORDER BY name').all());
});

r.get('/products', (req, res) => {
  const where = ["p.status='active'", "u.status='active'"];
  const args = [];
  const q = String(req.query.q || '')
    .trim()
    .slice(0, 80);
  if (req.query.category) {
    const cid = int(req.query.category, 'Kategoriya', { min: 1 });
    where.push('(p.category_id=? OR c.parent_id=?)');
    args.push(cid, cid);
  }
  if (req.query.inStock === '1') where.push('p.stock_qty>=p.min_individual_qty');
  let rows = db.prepare(`${PRODUCT_SELECT} WHERE ${where.join(' AND ')}`).all(...args);
  let scores = null,
    didYouMean = null;
  if (q) {
    ({ scores, didYouMean } = rankProducts(rows, q));
    rows = rows.filter((p) => scores.has(p.id));
  }
  let list = rows.map((p) => productDto(p));
  if (req.query.group === '1') list = list.filter((p) => p.openGroupId);
  const relevanceOf = (p) => scores?.get(p.id) ?? 0;
  const sort = req.query.sort || (q ? 'relevance' : 'new');
  const sorters = {
    new: (a, b) => b.id - a.id,
    price_asc: (a, b) => a.entryPrice - b.entryPrice,
    price_desc: (a, b) => b.entryPrice - a.entryPrice,
    saving: (a, b) => (b.savingsPct ?? -1) - (a.savingsPct ?? -1),
    relevance: (a, b) => relevanceOf(b) - relevanceOf(a) || b.id - a.id,
  };
  list.sort(sorters[sort] || sorters.new);
  const page = int(req.query.page ?? 1, 'Sahifa', { min: 1, max: 1000 });
  const per = req.query.per ? int(req.query.per, 'Soni', { min: 1, max: 100 }) : 24;
  res.json({
    total: list.length,
    page,
    perPage: per,
    q,
    didYouMean,
    items: list.slice((page - 1) * per, page * per),
  });
});

r.get('/search/suggest', (req, res) => {
  const q = String(req.query.q || '')
    .trim()
    .slice(0, 60);
  const cats = db.prepare('SELECT id,name FROM categories WHERE active=1 ORDER BY id').all();
  if (!q) return res.json({ q, popular: POPULAR, products: [], categories: [] });
  const rows = db.prepare(`${PRODUCT_SELECT} WHERE p.status='active' AND u.status='active'`).all();
  const { scores, didYouMean } = rankProducts(rows, q);
  const hit = rows
    .filter((p) => scores.has(p.id))
    .sort((a, b) => scores.get(b.id) - scores.get(a.id))
    .slice(0, 6);
  res.json({
    q,
    didYouMean,
    total: scores.size,
    categories: matchCategories(cats, q),
    products: hit.map((p) => {
      const d = productDto(p);
      return {
        slug: d.slug,
        title: d.title,
        imageUrl: d.imageUrl,
        emoji: d.emoji,
        categoryName: d.categoryName,
        entryPrice: d.entryPrice,
        unit: d.unit,
        savingsPct: d.savingsPct,
      };
    }),
  });
});

r.get('/products/:slug', (req, res) => {
  const p = db
    .prepare(`${PRODUCT_SELECT} WHERE p.slug=? AND p.status='active' AND u.status='active'`)
    .get(String(req.params.slug));
  if (!p) throw notFound('Mahsulot topilmadi');
  const dto = productDto(p, { full: true });
  delete dto.retailDraft;
  const groups = db
    .prepare("SELECT * FROM group_buys WHERE product_id=? AND status='open' AND ends_at>? ORDER BY ends_at")
    .all(p.id, nowIso())
    .map((g) => groupDto(g, req.user?.id));
  res.json({ ...dto, groups });
});

r.get('/groups', (req, res) => {
  sweep();
  const status = req.query.status === 'all' ? null : 'open';
  const rows = status
    ? db.prepare("SELECT * FROM group_buys WHERE status='open' AND ends_at>? ORDER BY ends_at").all(nowIso())
    : db.prepare('SELECT * FROM group_buys ORDER BY id DESC LIMIT 100').all();
  res.json(rows.map((g) => groupDto(g, req.user?.id)));
});
r.get('/groups/:id', (req, res) => {
  sweep();
  const g = db.prepare('SELECT * FROM group_buys WHERE id=?').get(int(req.params.id, 'Guruh', { min: 1 }));
  if (!g) throw notFound('Guruh topilmadi');
  res.json(groupDto(g, req.user?.id));
});

// ------------------------------------------------------------------ checkout / orders
r.post('/checkout/quote', writeLimit, (req, res) => {
  sweep();
  res.json(quoteDto(quote(req.body || {})));
});

r.post('/orders/individual', requireAuth, writeLimit, (req, res) => {
  const key = req.get('Idempotency-Key')?.slice(0, 100) || null;
  const out = createOrder(req.user, { ...req.body, type: 'individual' }, key);
  res
    .status(out.replay ? 200 : 201)
    .json({ ...out, order: orderDto(requireOwnedOrder(out.orderId, req.user)) });
});
r.post('/groups/:id/join', requireAuth, writeLimit, (req, res) => {
  const key = req.get('Idempotency-Key')?.slice(0, 100) || null;
  const out = createOrder(req.user, { ...req.body, type: 'group', groupId: req.params.id }, key);
  res
    .status(out.replay ? 200 : 201)
    .json({ ...out, order: orderDto(requireOwnedOrder(out.orderId, req.user)) });
});

r.get('/orders/me', requireAuth, (req, res) => {
  sweep();
  const rows = db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 200').all(req.user.id);
  res.json(rows.map((o) => orderDto(o)));
});
r.get('/orders/:id', requireAuth, (req, res) => {
  sweep();
  res.json(orderDto(requireOwnedOrder(req.params.id, req.user)));
});
r.post('/orders/:id/cancel', requireAuth, writeLimit, (req, res) => {
  const o = requireOwnedOrder(req.params.id, req.user);
  const group = o.group_id ? db.prepare('SELECT status FROM group_buys WHERE id=?').get(o.group_id) : null;
  if (!canBuyerCancel(o, group))
    throw conflict('Bu buyurtmani endi bekor qilib bo‘lmaydi', 'not_cancellable');
  cancelOrder(o, req.user.id, 'Xaridor bekor qildi');
  res.json(orderDto(requireOwnedOrder(o.id, req.user)));
});

r.post('/payments/intent', requireAuth, writeLimit, (req, res) => {
  res.json(createIntent(req.user, req.body?.orderId));
});

// ------------------------------------------------------------------ profile
const meSummary = (userId) => {
  const rows = db
    .prepare(
      "SELECT items FROM orders WHERE user_id=? AND status IN('confirmed','preparing','ready_for_delivery','out_for_delivery','delivered')",
    )
    .all(userId);
  let saved = 0;
  for (const o of rows)
    for (const it of JSON.parse(o.items))
      if (it.retailPrice > it.unitPrice) saved += (it.retailPrice - it.unitPrice) * it.qty;
  return { orders: rows.length, saved };
};
r.get('/me/summary', requireAuth, (req, res) => res.json(meSummary(req.user.id)));
r.patch('/me', requireAuth, writeLimit, (req, res) => {
  const name = str(req.body.name, 'Ism', { min: 2, max: 80 });
  const email = str(req.body.email, 'Email', { optional: true, max: 120 });
  db.prepare('UPDATE users SET name=?, email=? WHERE id=?').run(name, email, req.user.id);
  res.json({ ok: true });
});
r.post('/me/password', requireAuth, authLimit, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!verifyPassword(String(req.body.current ?? ''), u.password_hash)) throw bad('Joriy parol noto‘g‘ri');
  const pw = str(req.body.password, 'Yangi parol', { min: 8, max: 100 });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(pw), u.id);
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
  const s = createSession(u.id);
  setSessionCookie(res, s.token, s.maxAge);
  res.json({ ok: true });
});

const addrSelect = `SELECT a.id,a.label,a.zone_id zoneId,z.name zoneName,z.fee zoneFee,a.street,a.details,a.is_default isDefault
  FROM addresses a JOIN zones z ON z.id=a.zone_id WHERE a.user_id=? AND a.active=1 ORDER BY a.is_default DESC, a.id DESC`;
r.get('/me/addresses', requireAuth, (req, res) => res.json(db.prepare(addrSelect).all(req.user.id)));
r.post('/me/addresses', requireAuth, writeLimit, (req, res) => {
  const label = str(req.body.label || 'Uy', 'Nomi', { max: 40 });
  const street = str(req.body.street, 'Manzil', { min: 3, max: 200 });
  const details = str(req.body.details, 'Izoh', { optional: true, max: 200 });
  const zone = db
    .prepare('SELECT id FROM zones WHERE id=? AND active=1')
    .get(int(req.body.zoneId, 'Hudud', { min: 1 }));
  if (!zone) throw unprocessable('Bu hududga yetkazib berilmaydi');
  tx(() => {
    const first = !db.prepare('SELECT 1 FROM addresses WHERE user_id=? AND active=1').get(req.user.id);
    db.prepare(
      'INSERT INTO addresses(user_id,label,zone_id,street,details,is_default) VALUES(?,?,?,?,?,?)',
    ).run(req.user.id, label, zone.id, street, details, first ? 1 : 0);
  });
  res.status(201).json(db.prepare(addrSelect).all(req.user.id));
});
r.delete('/me/addresses/:id', requireAuth, (req, res) => {
  db.prepare('UPDATE addresses SET active=0 WHERE id=? AND user_id=?').run(
    int(req.params.id, 'Manzil', { min: 1 }),
    req.user.id,
  );
  res.json(db.prepare(addrSelect).all(req.user.id));
});
