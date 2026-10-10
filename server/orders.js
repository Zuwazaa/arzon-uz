import { db, tx, nowIso, getSettings } from './db.js';
import { tiersOf, tierFor, nextTier } from './pricing.js';
import { audit, bad, conflict, forbidden, notFound, unprocessable, int, oneOf } from './util.js';

// ---------------------------------------------------------------- state machine
const ORDER_FLOW = {
  pending_payment: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready_for_delivery', 'cancelled'],
  ready_for_delivery: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered', 'failed', 'ready_for_delivery'],
  delivered: [],
  cancelled: [],
  failed: [],
};
export const SLOTS = ['morning', 'day', 'evening'];

export function setOrderStatus(order, to, actorId, note) {
  if (!ORDER_FLOW[order.status]?.includes(to))
    throw conflict(
      `Buyurtma holatini “${order.status}” dan “${to}” ga o‘tkazib bo‘lmaydi`,
      'invalid_transition',
    );
  const at = nowIso();
  db.prepare('UPDATE orders SET status=?, updated_at=? WHERE id=?').run(to, at, order.id);
  db.prepare('INSERT INTO order_events(order_id,status,note,actor_id,at) VALUES(?,?,?,?,?)').run(
    order.id,
    to,
    note ?? null,
    actorId ?? null,
    at,
  );
  audit(actorId, 'order.status', 'order', order.id, { from: order.status, to, note });
  order.status = to;
}

// ---------------------------------------------------------------- group helpers
export function recountGroup(id) {
  const r = db
    .prepare(
      `SELECT COALESCE(SUM(qty),0) c, COALESCE(SUM(CASE WHEN status='paid' THEN qty ELSE 0 END),0) p
       FROM group_members WHERE group_id=? AND status IN('reserved','paid')`,
    )
    .get(id);
  db.prepare('UPDATE group_buys SET committed_qty=?, paid_qty=? WHERE id=?').run(r.c, r.p, id);
  return r;
}

/** Re-evaluates an open group: success / threshold / failure. Idempotent. */
export function evalGroup(id) {
  return tx(() => {
    let g = db.prepare('SELECT * FROM group_buys WHERE id=?').get(id);
    if (!g || !['open', 'threshold_met'].includes(g.status)) return g;
    const { c, p } = recountGroup(id);
    const now = nowIso();
    if (p >= g.target_qty) {
      finalizeSuccess(g, c);
    } else if (now >= g.ends_at) {
      closeGroupUnsuccessful(g, 'failed', null);
    } else {
      db.prepare('UPDATE group_buys SET status=? WHERE id=?').run(
        c >= g.target_qty ? 'threshold_met' : 'open',
        id,
      );
    }
    return db.prepare('SELECT * FROM group_buys WHERE id=?').get(id);
  });
}

function finalizeSuccess(g, committed) {
  const tiers = tiersOf(g.product_id);
  const finalPrice = tierFor(tiers, committed).unit_price;
  const members = db.prepare("SELECT * FROM group_members WHERE group_id=? AND status='paid'").all(g.id);
  for (const m of members) {
    if (m.unit_price_snapshot > finalPrice) {
      const diff = (m.unit_price_snapshot - finalPrice) * m.qty;
      const order = db.prepare('SELECT * FROM orders WHERE id=?').get(m.order_id);
      const items = JSON.parse(order.items);
      items[0].paidUnitPrice = items[0].unitPrice;
      items[0].unitPrice = finalPrice;
      const subtotal = finalPrice * m.qty;
      db.prepare('UPDATE orders SET items=?, subtotal=?, total=?, updated_at=? WHERE id=?').run(
        JSON.stringify(items),
        subtotal,
        subtotal + order.delivery_fee,
        nowIso(),
        order.id,
      );
      db.prepare(
        `UPDATE payments SET refund_status='refund_pending', refund_amount=refund_amount+?, refund_note=?, updated_at=?
         WHERE order_id=? AND status='paid'`,
      ).run(diff, 'Guruh yakuniy narxi bo‘yicha farq qaytariladi', nowIso(), order.id);
      db.prepare('UPDATE group_members SET unit_price_snapshot=? WHERE id=?').run(finalPrice, m.id);
      audit(null, 'group.price_adjust', 'order', order.id, {
        from: m.unit_price_snapshot,
        to: finalPrice,
        refund: diff,
      });
    }
  }
  db.prepare("UPDATE group_buys SET status='successful', closed_at=? WHERE id=?").run(nowIso(), g.id);
  audit(null, 'group.successful', 'group', g.id, { committed, finalPrice });
}

function closeGroupUnsuccessful(g, status, actorId) {
  db.prepare('UPDATE group_buys SET status=?, closed_at=? WHERE id=?').run(status, nowIso(), g.id);
  const orders = db
    .prepare(
      `SELECT o.* FROM orders o JOIN group_members m ON m.order_id=o.id
       WHERE m.group_id=? AND m.status IN('reserved','paid')`,
    )
    .all(g.id);
  for (const o of orders)
    cancelOrder(o, actorId, `Guruh ${status === 'failed' ? 'muvaffaqiyatsiz tugadi' : 'bekor qilindi'}`, {
      skipGroupEval: true,
    });
  recountGroup(g.id);
  audit(actorId, `group.${status}`, 'group', g.id, { orders: orders.length });
}

export function cancelGroup(id, actorId) {
  return tx(() => {
    const g = db.prepare('SELECT * FROM group_buys WHERE id=?').get(id);
    if (!g) throw notFound('Guruh topilmadi');
    if (!['open', 'threshold_met'].includes(g.status)) throw conflict('Bu guruhni bekor qilib bo‘lmaydi');
    closeGroupUnsuccessful(g, 'cancelled', actorId);
  });
}

// ---------------------------------------------------------------- cancel / release
export function cancelOrder(order, actorId, note, { skipGroupEval = false } = {}) {
  return tx(() => {
    setOrderStatus(order, 'cancelled', actorId, note);
    for (const it of JSON.parse(order.items))
      db.prepare('UPDATE products SET stock_qty=stock_qty+? WHERE id=?').run(it.qty, it.productId);
    db.prepare(
      "UPDATE group_members SET status='cancelled' WHERE order_id=? AND status IN('reserved','paid')",
    ).run(order.id);
    const at = nowIso();
    db.prepare("UPDATE payments SET status='failed', updated_at=? WHERE order_id=? AND status='pending'").run(
      at,
      order.id,
    );
    db.prepare(
      `UPDATE payments SET status='refund_pending', refund_status='refund_pending', refund_amount=amount, refund_note=?, updated_at=?
       WHERE order_id=? AND status='paid'`,
    ).run(note ?? 'Buyurtma bekor qilindi', at, order.id);
    if (order.group_id && !skipGroupEval) {
      recountGroup(order.group_id);
      evalGroup(order.group_id);
    }
  });
}

/** Releases stale payment holds and closes expired groups. Safe to call often. */
export function sweep() {
  tx(() => {
    const now = nowIso();
    const stale = db
      .prepare("SELECT * FROM orders WHERE status='pending_payment' AND hold_expires_at<?")
      .all(now);
    for (const o of stale) cancelOrder(o, null, 'To‘lov muddati tugadi');
    const groups = db
      .prepare("SELECT id FROM group_buys WHERE status IN('open','threshold_met') AND ends_at<=?")
      .all(now);
    for (const g of groups) evalGroup(g.id);
  });
}

// ---------------------------------------------------------------- quote
function activeProduct(id) {
  const p = db
    .prepare(
      `SELECT p.*, u.shop_name seller_name FROM products p JOIN users u ON u.id=p.seller_id
       WHERE p.id=? AND p.status='active' AND u.status='active'`,
    )
    .get(id);
  if (!p) throw notFound('Mahsulot topilmadi yoki sotuvda emas');
  return p;
}

export function quote({ type, productId, groupId, qty, zoneId }) {
  oneOf(type, ['individual', 'group'], 'type');
  const zone = db
    .prepare('SELECT * FROM zones WHERE id=? AND active=1')
    .get(int(zoneId, 'Hudud', { min: 1 }));
  if (!zone) throw unprocessable('Bu hududga yetkazib berilmaydi', 'zone_unavailable');
  qty = int(qty, 'Miqdor', { min: 1 });
  let product,
    group = null,
    unitPrice,
    tier,
    tiers;
  if (type === 'individual') {
    product = activeProduct(int(productId, 'Mahsulot', { min: 1 }));
    tiers = tiersOf(product.id);
    if (qty < product.min_individual_qty)
      throw unprocessable(
        `Minimal buyurtma miqdori: ${product.min_individual_qty} ${product.unit}`,
        'below_min',
        { minQty: product.min_individual_qty },
      );
    tier = tierFor(tiers, qty);
  } else {
    group = db.prepare('SELECT * FROM group_buys WHERE id=?').get(int(groupId, 'Guruh', { min: 1 }));
    if (!group) throw notFound('Guruh topilmadi');
    if (group.status !== 'open' || nowIso() >= group.ends_at)
      throw unprocessable('Bu guruh yangi ishtirokchilarni qabul qilmaydi', 'group_closed');
    product = activeProduct(group.product_id);
    tiers = tiersOf(product.id);
    if (qty < group.min_member_qty)
      throw unprocessable(
        `Guruhga kamida ${group.min_member_qty} ${product.unit} bilan qo‘shilish mumkin`,
        'below_min',
        { minQty: group.min_member_qty },
      );
    const remaining = group.target_qty - group.committed_qty;
    if (qty > remaining)
      throw unprocessable(`Guruhda faqat ${remaining} ${product.unit} joy qoldi`, 'exceeds_group', {
        availableQty: remaining,
      });
    tier = tierFor(tiers, group.committed_qty + qty);
  }
  if (qty % product.pack_size !== 0)
    throw unprocessable(
      `Miqdor ${product.pack_size} ${product.unit} qadoqqa karrali bo‘lishi kerak`,
      'pack_size',
      { packSize: product.pack_size },
    );
  if (qty > product.stock_qty)
    throw unprocessable(`Zaxirada faqat ${product.stock_qty} ${product.unit} bor`, 'insufficient_stock', {
      availableQty: product.stock_qty,
    });
  unitPrice = tier.unit_price;
  const subtotal = unitPrice * qty;
  return {
    type,
    groupId: group?.id ?? null,
    zone,
    product,
    group,
    qty,
    unitPrice,
    tierMinQty: tier.min_qty,
    subtotal,
    deliveryFee: zone.fee,
    total: subtotal + zone.fee,
    retailPrice: product.retail_verified ? product.retail_price : null,
    nextTier: nextTier(tiers, group ? group.committed_qty + qty : qty),
  };
}

export function quoteDto(q) {
  return {
    type: q.type,
    groupId: q.groupId,
    productId: q.product.id,
    title: q.product.title,
    unit: q.product.unit,
    qty: q.qty,
    unitPrice: q.unitPrice,
    tierMinQty: q.tierMinQty,
    subtotal: q.subtotal,
    deliveryFee: q.deliveryFee,
    total: q.total,
    zone: { id: q.zone.id, name: q.zone.name },
    savings: q.retailPrice && q.retailPrice > q.unitPrice ? (q.retailPrice - q.unitPrice) * q.qty : null,
    nextTier: q.nextTier ? { minQty: q.nextTier.min_qty, unitPrice: q.nextTier.unit_price } : null,
    priceFinalNote:
      q.type === 'group'
        ? 'Yakuniy narx guruh yopilgandagi umumiy miqdorga qarab aniqlanadi. To‘langan narx yuqori bo‘lsa, farq qaytariladi.'
        : null,
  };
}

// ---------------------------------------------------------------- create order / join group
export function createOrder(user, body, idempotencyKey) {
  sweep();
  return tx(() => {
    if (idempotencyKey) {
      const ex = db
        .prepare('SELECT id FROM orders WHERE user_id=? AND idempotency_key=?')
        .get(user.id, idempotencyKey);
      if (ex) return { orderId: ex.id, replay: true };
    }
    const addr = db
      .prepare(
        'SELECT a.*, z.name zone_name FROM addresses a JOIN zones z ON z.id=a.zone_id WHERE a.id=? AND a.user_id=? AND a.active=1',
      )
      .get(int(body.addressId, 'Manzil', { min: 1 }), user.id);
    if (!addr) throw unprocessable('Yetkazib berish manzilini tanlang', 'address_required');
    const slot = body.slot ? oneOf(body.slot, SLOTS, 'Yetkazish vaqti') : 'day';
    const q = quote({ ...body, zoneId: addr.zone_id });
    const { product, group } = q;

    if (group) {
      const dup = db
        .prepare(
          "SELECT 1 FROM group_members WHERE group_id=? AND user_id=? AND status IN('reserved','paid')",
        )
        .get(group.id, user.id);
      if (dup) throw conflict('Siz bu guruhga allaqachon qo‘shilgansiz', 'already_member');
    }
    // atomic stock reservation (guarded update)
    const r = db
      .prepare('UPDATE products SET stock_qty=stock_qty-? WHERE id=? AND stock_qty>=?')
      .run(q.qty, product.id, q.qty);
    if (r.changes === 0) throw unprocessable('Zaxira yetarli emas', 'insufficient_stock');
    if (group) {
      const g = db
        .prepare(
          "UPDATE group_buys SET committed_qty=committed_qty+? WHERE id=? AND status='open' AND committed_qty+?<=target_qty AND ends_at>?",
        )
        .run(q.qty, group.id, q.qty, nowIso());
      if (g.changes === 0) throw unprocessable('Guruhda joy qolmadi yoki guruh yopildi', 'group_closed');
    }

    const now = nowIso();
    const hold = new Date(Date.now() + getSettings().hold_minutes * 60000).toISOString();
    const item = {
      productId: product.id,
      title: product.title,
      emoji: product.emoji,
      imageUrl: product.image_url,
      unit: product.unit,
      packSize: product.pack_size,
      qty: q.qty,
      unitPrice: q.unitPrice,
      tierMinQty: q.tierMinQty,
      sellerId: product.seller_id,
      sellerName: product.seller_name,
      retailPrice: q.retailPrice,
    };
    const snapshot = {
      label: addr.label,
      zoneId: addr.zone_id,
      zoneName: addr.zone_name,
      street: addr.street,
      details: addr.details,
      name: user.name,
      phone: user.phone,
    };
    const ins = db
      .prepare(
        `INSERT INTO orders(user_id,seller_id,type,group_id,items,subtotal,delivery_fee,total,address_snapshot,zone_id,delivery_slot,
           status,idempotency_key,hold_expires_at,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,'pending_payment',?,?,?,?)`,
      )
      .run(
        user.id,
        product.seller_id,
        q.type,
        group?.id ?? null,
        JSON.stringify([item]),
        q.subtotal,
        q.deliveryFee,
        q.total,
        JSON.stringify(snapshot),
        addr.zone_id,
        slot,
        idempotencyKey ?? null,
        hold,
        now,
        now,
      );
    const orderId = Number(ins.lastInsertRowid);
    db.prepare('INSERT INTO order_events(order_id,status,note,actor_id,at) VALUES(?,?,?,?,?)').run(
      orderId,
      'pending_payment',
      null,
      user.id,
      now,
    );
    db.prepare('INSERT INTO deliveries(order_id,address_snapshot,zone_id,fee) VALUES(?,?,?,?)').run(
      orderId,
      JSON.stringify(snapshot),
      addr.zone_id,
      q.deliveryFee,
    );
    if (group) {
      db.prepare(
        "INSERT INTO group_members(group_id,user_id,qty,unit_price_snapshot,status,order_id,created_at) VALUES(?,?,?,?,'reserved',?,?)",
      ).run(group.id, user.id, q.qty, q.unitPrice, orderId, now);
      evalGroup(group.id);
    }
    audit(user.id, group ? 'group.join' : 'order.create', 'order', orderId, {
      qty: q.qty,
      unitPrice: q.unitPrice,
      total: q.total,
    });
    return { orderId, replay: false };
  });
}

// ---------------------------------------------------------------- DTOs
export function orderDto(o, { forSeller = false } = {}) {
  const items = JSON.parse(o.items);
  const addr = JSON.parse(o.address_snapshot);
  const pay = db.prepare('SELECT * FROM payments WHERE order_id=? ORDER BY id DESC LIMIT 1').get(o.id);
  const del = db.prepare('SELECT * FROM deliveries WHERE order_id=?').get(o.id);
  const group = o.group_id
    ? db
        .prepare('SELECT id,status,target_qty,committed_qty,ends_at FROM group_buys WHERE id=?')
        .get(o.group_id)
    : null;
  const dto = {
    id: o.id,
    type: o.type,
    status: o.status,
    items,
    subtotal: o.subtotal,
    deliveryFee: o.delivery_fee,
    total: o.total,
    currency: o.currency,
    slot: o.delivery_slot,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    holdExpiresAt: o.status === 'pending_payment' ? o.hold_expires_at : null,
    group: group && {
      id: group.id,
      status: group.status,
      targetQty: group.target_qty,
      committedQty: group.committed_qty,
      endsAt: group.ends_at,
    },
    payment: pay && {
      status: pay.status,
      refundStatus: pay.refund_status,
      refundAmount: pay.refund_amount,
      paidAt: pay.paid_at,
      note: pay.refund_note,
    },
    delivery: del && {
      id: del.id,
      status: del.status,
      scheduledAt: del.scheduled_at,
      windowEnd: del.window_end,
      deliveredAt: del.delivered_at,
    },
    waitingForGroup: !!group && ['open', 'threshold_met'].includes(group.status) && o.status === 'confirmed',
    savings:
      items.reduce(
        (s, it) =>
          s +
          (it.retailPrice && it.retailPrice > it.unitPrice ? (it.retailPrice - it.unitPrice) * it.qty : 0),
        0,
      ) || null,
  };
  if (forSeller) {
    dto.buyer = addr.name?.split(' ')[0] || 'Xaridor';
    dto.zone = addr.zoneName;
  } else {
    dto.address = addr;
    dto.events = db.prepare('SELECT status,note,at FROM order_events WHERE order_id=? ORDER BY id').all(o.id);
    dto.canCancel = canBuyerCancel(o, group);
  }
  return dto;
}

export function canBuyerCancel(o, group) {
  if (o.status === 'pending_payment') return true;
  if (o.status !== 'confirmed') return false;
  if (o.type === 'individual') return true;
  return !!group && ['open', 'threshold_met'].includes(group.status);
}

export function assertFulfillable(order) {
  if (!order.group_id) return;
  const g = db.prepare('SELECT status FROM group_buys WHERE id=?').get(order.group_id);
  if (g?.status !== 'successful')
    throw conflict('Guruh hali muvaffaqiyatli yakunlanmagan', 'group_not_ready');
}

export function requireOwnedOrder(id, user) {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(int(id, 'Buyurtma', { min: 1 }));
  if (!o || o.user_id !== user.id) throw notFound('Buyurtma topilmadi');
  return o;
}
export { forbidden, bad };
