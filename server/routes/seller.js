import { Router } from 'express';
import { db, tx, nowIso, getSettings } from '../db.js';
import { requireRole, rateLimit } from '../auth.js';
import { ApiError, audit, bad, conflict, forbidden, int, notFound, oneOf, slugify, str } from '../util.js';
import { productDto, groupDto, PRODUCT_SELECT } from '../dto.js';
import { validateTiers } from '../pricing.js';
import { orderDto, setOrderStatus, assertFulfillable } from '../orders.js';

export const r = Router();
r.use(requireRole('seller'), rateLimit('seller', 120, 60_000));

const activeSeller = (req) => {
  if (req.user.status !== 'active')
    throw new ApiError(403, 'seller_pending', 'Do‘koningiz hali administrator tomonidan tasdiqlanmagan');
};
const ownProduct = (req, id) => {
  const p = db
    .prepare(`${PRODUCT_SELECT} WHERE p.id=? AND p.seller_id=?`)
    .get(int(id, 'Mahsulot', { min: 1 }), req.user.id);
  if (!p) throw notFound('Mahsulot topilmadi');
  return p;
};

function readProduct(body, partial = false) {
  const out = {};
  const has = (k) => body[k] !== undefined;
  if (!partial || has('title')) out.title = str(body.title, 'Nomi', { min: 3, max: 120 });
  if (!partial || has('description'))
    out.description = str(body.description ?? '', 'Tavsif', { min: 0, max: 2000, optional: true }) ?? '';
  if (!partial || has('categoryId')) {
    out.category_id = int(body.categoryId, 'Kategoriya', { min: 1 });
    if (!db.prepare('SELECT 1 FROM categories WHERE id=? AND active=1').get(out.category_id))
      throw bad('Kategoriya topilmadi');
  }
  if (!partial || has('emoji')) out.emoji = str(body.emoji || '📦', 'Belgi', { max: 8 });
  if (!partial || has('unit')) out.unit = str(body.unit, 'O‘lchov birligi', { max: 20 });
  if (!partial || has('packSize'))
    out.pack_size = int(body.packSize ?? 1, 'Qadoq miqdori', { min: 1, max: 100000 });
  if (!partial || has('minIndividualQty'))
    out.min_individual_qty = int(body.minIndividualQty, 'Minimal buyurtma', { min: 1, max: 1e7 });
  if (!partial || has('stockQty')) out.stock_qty = int(body.stockQty, 'Zaxira', { min: 0, max: 1e9 });
  if (has('retailPrice')) {
    out.retail_price =
      body.retailPrice === null || body.retailPrice === ''
        ? null
        : int(body.retailPrice, 'Bozor narxi', { min: 1 });
    out.retail_source = out.retail_price
      ? str(body.retailSource, 'Bozor narxi manbasi', { min: 3, max: 200 })
      : null;
    out.retail_verified = 0; // admin must (re)verify any retail price change
  }
  return out;
}

r.get('/products', (req, res) => {
  const rows = db.prepare(`${PRODUCT_SELECT} WHERE p.seller_id=? ORDER BY p.id DESC`).all(req.user.id);
  res.json(rows.map((p) => productDto(p, { full: true })));
});

r.post('/products', (req, res) => {
  activeSeller(req);
  const f = readProduct(req.body);
  const tiers = validateTiers(req.body.tiers, f.min_individual_qty);
  const id = tx(() => {
    const now = nowIso();
    const cols = Object.keys(f);
    const info = db
      .prepare(
        `INSERT INTO products(seller_id,slug,status,created_at,updated_at,${cols.join(',')}) VALUES(?,?,?,?,?,${cols.map(() => '?').join(',')})`,
      )
      .run(req.user.id, `tmp-${Math.random()}`, 'pending', now, now, ...cols.map((c) => f[c]));
    const pid = Number(info.lastInsertRowid);
    db.prepare('UPDATE products SET slug=? WHERE id=?').run(`${slugify(f.title)}-${pid}`, pid);
    for (const t of tiers)
      db.prepare('INSERT INTO price_tiers(product_id,min_qty,unit_price) VALUES(?,?,?)').run(
        pid,
        t.min_qty,
        t.unit_price,
      );
    audit(req.user.id, 'product.create', 'product', pid, { tiers });
    return pid;
  });
  res.status(201).json(productDto(ownProduct(req, id), { full: true }));
});

r.patch('/products/:id', (req, res) => {
  activeSeller(req);
  const cur = ownProduct(req, req.params.id);
  const f = readProduct(req.body, true);
  tx(() => {
    const touchesContent = ['title', 'description', 'category_id', 'retail_price'].some((k) => k in f);
    if (req.body.status !== undefined) {
      const st = oneOf(req.body.status, ['archived', 'pending'], 'Holat');
      if (st === 'pending' && cur.status !== 'archived')
        throw conflict('Faqat arxivdagi mahsulotni qayta yuborish mumkin');
      f.status = st;
    } else if (touchesContent && cur.status === 'active') f.status = 'pending'; // re-moderation
    if (req.body.tiers !== undefined) {
      const open = db
        .prepare("SELECT 1 FROM group_buys WHERE product_id=? AND status IN('open','threshold_met')")
        .get(cur.id);
      if (open)
        throw conflict('Faol guruh mavjud bo‘lganda narx bosqichlarini o‘zgartirib bo‘lmaydi', 'open_group');
      const tiers = validateTiers(req.body.tiers, f.min_individual_qty ?? cur.min_individual_qty);
      const old = db
        .prepare('SELECT min_qty,unit_price FROM price_tiers WHERE product_id=? ORDER BY min_qty')
        .all(cur.id);
      db.prepare('DELETE FROM price_tiers WHERE product_id=?').run(cur.id);
      for (const t of tiers)
        db.prepare('INSERT INTO price_tiers(product_id,min_qty,unit_price) VALUES(?,?,?)').run(
          cur.id,
          t.min_qty,
          t.unit_price,
        );
      audit(req.user.id, 'product.tiers', 'product', cur.id, { from: old, to: tiers });
    }
    f.updated_at = nowIso();
    const cols = Object.keys(f);
    db.prepare(`UPDATE products SET ${cols.map((c) => `${c}=?`).join(',')} WHERE id=?`).run(
      ...cols.map((c) => f[c]),
      cur.id,
    );
    if ('stock_qty' in f)
      audit(req.user.id, 'product.stock', 'product', cur.id, { from: cur.stock_qty, to: f.stock_qty });
  });
  res.json(productDto(ownProduct(req, cur.id), { full: true }));
});

// ---- orders (seller sees only what is needed to prepare goods: no phone/address)
r.get('/orders', (req, res) => {
  const rows = db
    .prepare(
      "SELECT * FROM orders WHERE seller_id=? AND status!='pending_payment' ORDER BY id DESC LIMIT 200",
    )
    .all(req.user.id);
  res.json(rows.map((o) => orderDto(o, { forSeller: true })));
});
r.patch('/orders/:id/status', (req, res) => {
  activeSeller(req);
  const o = db
    .prepare('SELECT * FROM orders WHERE id=? AND seller_id=?')
    .get(int(req.params.id, 'Buyurtma', { min: 1 }), req.user.id);
  if (!o) throw notFound('Buyurtma topilmadi');
  const to = oneOf(req.body.status, ['preparing', 'ready_for_delivery'], 'Holat');
  tx(() => {
    assertFulfillable(o);
    setOrderStatus(o, to, req.user.id, to === 'preparing' ? 'Sotuvchi zaxirani tasdiqladi' : 'Tovar tayyor');
  });
  res.json(orderDto(db.prepare('SELECT * FROM orders WHERE id=?').get(o.id), { forSeller: true }));
});

// ---- groups for own products
r.get('/groups', (req, res) => {
  res.json(
    db
      .prepare('SELECT * FROM group_buys WHERE seller_id=? ORDER BY id DESC')
      .all(req.user.id)
      .map((g) => groupDto(g)),
  );
});
r.post('/groups', (req, res) => {
  activeSeller(req);
  const id = createGroup(req.user, req.body, true);
  res.status(201).json(groupDto(db.prepare('SELECT * FROM group_buys WHERE id=?').get(id)));
});

export function createGroup(actor, body, ownerOnly) {
  const p = db
    .prepare("SELECT * FROM products WHERE id=? AND status='active'")
    .get(int(body.productId, 'Mahsulot', { min: 1 }));
  if (!p) throw notFound('Faol mahsulot topilmadi');
  if (ownerOnly && p.seller_id !== actor.id) throw forbidden();
  const target = int(body.targetQty, 'Maqsad miqdor', { min: 1 });
  if (target % p.pack_size !== 0)
    throw bad(`Maqsad miqdor ${p.pack_size} ${p.unit} qadoqqa karrali bo‘lishi kerak`);
  const minMember = int(body.minMemberQty ?? p.pack_size, 'Ishtirokchi minimal miqdori', { min: 1 });
  if (minMember > target) throw bad('Ishtirokchi minimal miqdori maqsaddan katta bo‘la olmaydi');
  const hours = int(body.durationHours ?? getSettings().group_duration_hours, 'Muddat (soat)', {
    min: 1,
    max: 24 * 30,
  });
  if (
    db.prepare("SELECT 1 FROM group_buys WHERE product_id=? AND status IN('open','threshold_met')").get(p.id)
  )
    throw conflict('Bu mahsulot uchun faol guruh allaqachon bor', 'group_exists');
  const now = nowIso();
  const info = db
    .prepare(
      'INSERT INTO group_buys(product_id,seller_id,target_qty,min_member_qty,starts_at,ends_at,created_at) VALUES(?,?,?,?,?,?,?)',
    )
    .run(
      p.id,
      p.seller_id,
      target,
      minMember,
      now,
      new Date(Date.now() + hours * 3600_000).toISOString(),
      now,
    );
  audit(actor.id, 'group.create', 'group', Number(info.lastInsertRowid), { target, hours });
  return Number(info.lastInsertRowid);
}
