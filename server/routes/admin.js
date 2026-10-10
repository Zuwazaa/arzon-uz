import { Router } from 'express';
import { db, tx, nowIso, getSettings, DEFAULT_SETTINGS } from '../db.js';
import { requireRole, rateLimit } from '../auth.js';
import { audit, bad, conflict, int, notFound, oneOf, str } from '../util.js';
import { productDto, groupDto, PRODUCT_SELECT } from '../dto.js';
import { orderDto, setOrderStatus, assertFulfillable, cancelGroup, cancelOrder, sweep } from '../orders.js';
import { adminRefund } from '../payments.js';
import { createGroup } from './seller.js';

export const r = Router();
r.use(requireRole('admin'), rateLimit('admin', 240, 60_000));

// ------------------------------------------------------------------ orders
r.get('/orders', (req, res) => {
  sweep();
  const where = [];
  const args = [];
  if (req.query.status) {
    where.push('o.status=?');
    args.push(String(req.query.status));
  }
  if (req.query.refund === '1')
    where.push("EXISTS(SELECT 1 FROM payments p WHERE p.order_id=o.id AND p.refund_status='refund_pending')");
  const rows = db
    .prepare(
      `SELECT o.* FROM orders o ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY o.id DESC LIMIT 300`,
    )
    .all(...args);
  res.json(rows.map((o) => orderDto(o)));
});
r.patch('/orders/:id/status', (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(int(req.params.id, 'Buyurtma', { min: 1 }));
  if (!o) throw notFound('Buyurtma topilmadi');
  const to = oneOf(req.body.status, ['preparing', 'ready_for_delivery', 'cancelled'], 'Holat');
  tx(() => {
    if (to === 'cancelled')
      cancelOrder(o, req.user.id, str(req.body.note || 'Admin bekor qildi', 'Izoh', { max: 200 }));
    else {
      assertFulfillable(o);
      setOrderStatus(o, to, req.user.id, req.body.note);
    }
  });
  res.json(orderDto(db.prepare('SELECT * FROM orders WHERE id=?').get(o.id)));
});
r.post('/orders/:id/refund', (req, res) => {
  const p = adminRefund(req.user, req.params.id, {
    action: req.body.action,
    amount: req.body.amount,
    note: str(req.body.note, 'Izoh', { optional: true, max: 200 }),
  });
  res.json({ payment: p, order: orderDto(db.prepare('SELECT * FROM orders WHERE id=?').get(p.order_id)) });
});

// ------------------------------------------------------------------ deliveries
const DEL_FLOW = {
  not_scheduled: ['scheduled'],
  scheduled: ['out_for_delivery', 'scheduled'],
  out_for_delivery: ['delivered', 'delivery_failed'],
  delivery_failed: ['scheduled'],
  delivered: [],
};
r.get('/deliveries', (req, res) => {
  const rows = db
    .prepare(
      `SELECT d.*, o.status order_status, o.delivery_slot, o.total, o.group_id, z.name zone_name FROM deliveries d
       JOIN orders o ON o.id=d.order_id JOIN zones z ON z.id=d.zone_id
       WHERE o.status NOT IN('pending_payment','cancelled') ORDER BY (d.status='delivered'), d.scheduled_at IS NULL, d.scheduled_at, d.id DESC LIMIT 300`,
    )
    .all();
  res.json(
    rows.map((d) => ({
      id: d.id,
      orderId: d.order_id,
      orderStatus: d.order_status,
      status: d.status,
      zone: d.zone_name,
      fee: d.fee,
      slot: d.delivery_slot,
      scheduledAt: d.scheduled_at,
      windowEnd: d.window_end,
      deliveredAt: d.delivered_at,
      courier: d.courier,
      actualCost: d.actual_cost,
      address: JSON.parse(d.address_snapshot),
      groupId: d.group_id,
    })),
  );
});
r.patch('/deliveries/:id', (req, res) => {
  const d = db
    .prepare('SELECT * FROM deliveries WHERE id=?')
    .get(int(req.params.id, 'Yetkazish', { min: 1 }));
  if (!d) throw notFound('Yetkazish yozuvi topilmadi');
  tx(() => {
    const order = db.prepare('SELECT * FROM orders WHERE id=?').get(d.order_id);
    const b = req.body;
    const set = {};
    if (b.courier !== undefined) set.courier = str(b.courier, 'Kuryer', { optional: true, max: 80 });
    if (b.actualCost !== undefined)
      set.actual_cost = b.actualCost === null ? null : int(b.actualCost, 'Haqiqiy xarajat', { min: 0 });
    if (b.note !== undefined) set.note = str(b.note, 'Izoh', { optional: true, max: 200 });
    if (b.scheduledAt !== undefined) {
      const t = new Date(b.scheduledAt);
      if (Number.isNaN(t.getTime())) throw bad('Vaqt noto‘g‘ri');
      set.scheduled_at = t.toISOString();
      const win = int(b.windowMinutes ?? getSettings().delivery_window_minutes, 'Vaqt oralig‘i', {
        min: 15,
        max: 1440,
      });
      set.window_end = new Date(t.getTime() + win * 60000).toISOString();
    }
    const to = b.status;
    if (to !== undefined) {
      oneOf(to, Object.keys(DEL_FLOW).concat('delivery_failed'), 'Holat');
      if (!DEL_FLOW[d.status]?.includes(to))
        throw conflict(
          `Yetkazish holatini “${d.status}” dan “${to}” ga o‘tkazib bo‘lmaydi`,
          'invalid_transition',
        );
      if (['scheduled', 'out_for_delivery'].includes(to)) assertFulfillable(order);
      if (to === 'scheduled' && !(set.scheduled_at || d.scheduled_at))
        throw bad('Rejalashtirilgan vaqtni kiriting');
      if (to === 'scheduled' && order.status === 'out_for_delivery')
        setOrderStatus(order, 'ready_for_delivery', req.user.id, 'Yetkazish qayta rejalashtirildi');
      if (to === 'scheduled' && !['confirmed', 'preparing', 'ready_for_delivery'].includes(order.status))
        throw conflict('Buyurtma holati rejalashtirishga mos emas');
      if (to === 'out_for_delivery') setOrderStatus(order, 'out_for_delivery', req.user.id, 'Yo‘lga chiqdi');
      if (to === 'delivered') {
        setOrderStatus(order, 'delivered', req.user.id, 'Yetkazildi');
        set.delivered_at = nowIso();
      }
      if (to === 'delivery_failed') audit(req.user.id, 'delivery.failed', 'delivery', d.id, { note: b.note });
      set.status = to;
    }
    const cols = Object.keys(set);
    if (cols.length)
      db.prepare(`UPDATE deliveries SET ${cols.map((c) => `${c}=?`).join(',')} WHERE id=?`).run(
        ...cols.map((c) => set[c]),
        d.id,
      );
    audit(req.user.id, 'delivery.update', 'delivery', d.id, set);
  });
  res.json(db.prepare('SELECT * FROM deliveries WHERE id=?').get(d.id));
});
r.post('/orders/:id/mark-failed', (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(int(req.params.id, 'Buyurtma', { min: 1 }));
  if (!o) throw notFound('Buyurtma topilmadi');
  tx(() => {
    const d = db.prepare('SELECT status FROM deliveries WHERE order_id=?').get(o.id);
    if (d?.status !== 'delivery_failed')
      throw conflict('Faqat yetkazilmagan buyurtmani “failed” qilish mumkin');
    setOrderStatus(
      o,
      'failed',
      req.user.id,
      str(req.body.note || 'Yetkazib berib bo‘lmadi', 'Izoh', { max: 200 }),
    );
    db.prepare(
      `UPDATE payments SET status='refund_pending', refund_status='refund_pending', refund_amount=amount, updated_at=? WHERE order_id=? AND status='paid'`,
    ).run(nowIso(), o.id);
  });
  res.json(orderDto(db.prepare('SELECT * FROM orders WHERE id=?').get(o.id)));
});

// ------------------------------------------------------------------ groups
r.get('/groups', (_req, res) => {
  sweep();
  res.json(
    db
      .prepare('SELECT * FROM group_buys ORDER BY id DESC LIMIT 200')
      .all()
      .map((g) => groupDto(g)),
  );
});
r.post('/groups', (req, res) => {
  const id = createGroup(req.user, req.body, false);
  res.status(201).json(groupDto(db.prepare('SELECT * FROM group_buys WHERE id=?').get(id)));
});
r.post('/groups/:id/cancel', (req, res) => {
  cancelGroup(int(req.params.id, 'Guruh', { min: 1 }), req.user.id);
  res.json(groupDto(db.prepare('SELECT * FROM group_buys WHERE id=?').get(req.params.id)));
});

// ------------------------------------------------------------------ catalog moderation
r.get('/products', (req, res) => {
  const st = req.query.status ? String(req.query.status) : null;
  const rows = db
    .prepare(
      `${PRODUCT_SELECT} ${st ? 'WHERE p.status=?' : ''} ORDER BY (p.status='pending') DESC, p.id DESC LIMIT 300`,
    )
    .all(...(st ? [st] : []));
  res.json(rows.map((p) => productDto(p, { full: true })));
});
r.patch('/products/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id=?').get(int(req.params.id, 'Mahsulot', { min: 1 }));
  if (!p) throw notFound('Mahsulot topilmadi');
  const set = {};
  if (req.body.status !== undefined)
    set.status = oneOf(req.body.status, ['active', 'rejected', 'pending', 'archived'], 'Holat');
  if (req.body.retailVerified !== undefined) {
    if (req.body.retailVerified && !p.retail_price) throw bad('Bozor narxi kiritilmagan');
    set.retail_verified = req.body.retailVerified ? 1 : 0;
  }
  const cols = Object.keys(set);
  if (cols.length) {
    set.updated_at = nowIso();
    db.prepare(
      `UPDATE products SET ${Object.keys(set)
        .map((c) => `${c}=?`)
        .join(',')} WHERE id=?`,
    ).run(...Object.values(set), p.id);
    audit(req.user.id, 'product.moderate', 'product', p.id, set);
  }
  res.json(productDto(db.prepare(`${PRODUCT_SELECT} WHERE p.id=?`).get(p.id), { full: true }));
});

// ------------------------------------------------------------------ sellers
r.get('/sellers', (_req, res) => {
  res.json(
    db
      .prepare(
        "SELECT id,name,phone,shop_name shopName,status,created_at createdAt FROM users WHERE role='seller' ORDER BY (status='pending') DESC, id DESC",
      )
      .all(),
  );
});
r.patch('/sellers/:id', (req, res) => {
  const status = oneOf(req.body.status, ['active', 'blocked', 'pending'], 'Holat');
  const info = db
    .prepare("UPDATE users SET status=? WHERE id=? AND role='seller'")
    .run(status, int(req.params.id, 'Sotuvchi', { min: 1 }));
  if (!info.changes) throw notFound('Sotuvchi topilmadi');
  if (status === 'blocked') db.prepare('DELETE FROM sessions WHERE user_id=?').run(req.params.id);
  audit(req.user.id, 'seller.status', 'user', Number(req.params.id), { status });
  res.json({ ok: true });
});

// ------------------------------------------------------------------ zones & settings
r.get('/zones', (_req, res) =>
  res.json(db.prepare('SELECT id,name,fee,active FROM zones ORDER BY id').all()),
);
r.post('/zones', (req, res) => {
  const info = db
    .prepare('INSERT INTO zones(name,fee) VALUES(?,?)')
    .run(str(req.body.name, 'Nomi', { max: 80 }), int(req.body.fee, 'Narx', { min: 0, max: 10_000_000 }));
  audit(req.user.id, 'zone.create', 'zone', Number(info.lastInsertRowid), req.body);
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});
r.patch('/zones/:id', (req, res) => {
  const z = db.prepare('SELECT * FROM zones WHERE id=?').get(int(req.params.id, 'Hudud', { min: 1 }));
  if (!z) throw notFound('Hudud topilmadi');
  const name = req.body.name !== undefined ? str(req.body.name, 'Nomi', { max: 80 }) : z.name;
  const fee = req.body.fee !== undefined ? int(req.body.fee, 'Narx', { min: 0, max: 10_000_000 }) : z.fee;
  const active = req.body.active !== undefined ? (req.body.active ? 1 : 0) : z.active;
  db.prepare('UPDATE zones SET name=?, fee=?, active=? WHERE id=?').run(name, fee, active, z.id);
  audit(req.user.id, 'zone.update', 'zone', z.id, { from: z, to: { name, fee, active } });
  res.json({ ok: true });
});
r.get('/settings', (_req, res) => res.json(getSettings()));
r.patch('/settings', (req, res) => {
  tx(() => {
    for (const [k, v] of Object.entries(req.body || {})) {
      if (!(k in DEFAULT_SETTINGS)) throw bad(`Noma’lum sozlama: ${k}`);
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 1e6) throw bad(`“${k}” qiymati noto‘g‘ri`);
      db.prepare(
        'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      ).run(k, String(n));
      audit(req.user.id, 'settings.update', 'settings', null, { [k]: n });
    }
  });
  res.json(getSettings());
});

r.get('/audit', (_req, res) => {
  res.json(
    db
      .prepare(
        'SELECT a.*, u.name actor FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 200',
      )
      .all(),
  );
});

// ------------------------------------------------------------------ analytics (PRD §11)
r.get('/stats', (req, res) => {
  sweep();
  const s = getSettings();
  const days = int(req.query.days ?? 90, 'Davr', { min: 1, max: 3650 });
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const ratio = (a, b) => (b ? a / b : null);

  const gOk = one("SELECT COUNT(*) n FROM group_buys WHERE status='successful' AND created_at>=?", since).n;
  const gFail = one("SELECT COUNT(*) n FROM group_buys WHERE status='failed' AND created_at>=?", since).n;

  const live = db
    .prepare(
      `SELECT * FROM orders WHERE created_at>=? AND status IN('confirmed','preparing','ready_for_delivery','out_for_delivery','delivered')`,
    )
    .all(since);
  let savings = 0;
  for (const o of live)
    for (const it of JSON.parse(o.items))
      if (it.retailPrice > it.unitPrice) savings += (it.retailPrice - it.unitPrice) * it.qty;

  const dl = db
    .prepare(
      `SELECT d.*, o.subtotal, o.total, o.delivery_fee FROM deliveries d JOIN orders o ON o.id=d.order_id WHERE d.status='delivered' AND d.delivered_at>=?`,
    )
    .all(since);
  const costed = dl.filter((d) => d.actual_cost !== null);
  const timed = dl.filter((d) => d.window_end);
  const onTime = timed.filter((d) => d.delivered_at <= d.window_end).length;

  const buyers = db
    .prepare(
      `SELECT user_id, COUNT(*) n FROM orders WHERE created_at>=? AND status IN('confirmed','preparing','ready_for_delivery','out_for_delivery','delivered') GROUP BY user_id`,
    )
    .all(since);
  const repeat = buyers.filter((b) => b.n >= 2).length;

  let contribution = 0;
  for (const d of costed) {
    const commission = Math.round((d.subtotal * s.commission_pct) / 100);
    const payFee = Math.round((d.total * s.payment_fee_pct) / 100);
    contribution += commission + d.delivery_fee - d.actual_cost - payFee;
  }

  const paidOrders = one(
    'SELECT COUNT(DISTINCT p.order_id) n FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.paid_at IS NOT NULL AND o.created_at>=?',
    since,
  ).n;
  const refunded = one(
    `SELECT COUNT(DISTINCT o.id) n FROM orders o JOIN payments p ON p.order_id=o.id
     WHERE p.paid_at IS NOT NULL AND o.created_at>=? AND (o.status IN('cancelled','failed') OR p.refund_status!='none')`,
    since,
  ).n;

  res.json({
    days,
    groupCompletionRate: ratio(gOk, gOk + gFail),
    groupsSuccessful: gOk,
    groupsFailed: gFail,
    realSavings: savings,
    deliveryCostPerOrder: costed.length
      ? Math.round(costed.reduce((a, d) => a + d.actual_cost, 0) / costed.length)
      : null,
    onTimeRate: ratio(onTime, timed.length),
    repeatPurchaseRate: ratio(repeat, buyers.length),
    contributionPerOrder: costed.length ? Math.round(contribution / costed.length) : null,
    cancellationRefundRate: ratio(refunded, paidOrders),
    ordersTotal: live.length,
    deliveredOrders: dl.length,
    paidOrders,
    pending: {
      sellers: one("SELECT COUNT(*) n FROM users WHERE role='seller' AND status='pending'").n,
      products: one("SELECT COUNT(*) n FROM products WHERE status='pending'").n,
      refunds: one("SELECT COUNT(*) n FROM payments WHERE refund_status='refund_pending'").n,
      toSchedule: one(
        "SELECT COUNT(*) n FROM deliveries d JOIN orders o ON o.id=d.order_id WHERE d.status='not_scheduled' AND o.status IN('confirmed','preparing','ready_for_delivery')",
      ).n,
    },
  });
});
