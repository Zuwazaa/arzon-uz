import crypto from 'node:crypto';
import { db, tx, nowIso } from './db.js';
import { ApiError, audit, bad, conflict, notFound, unprocessable, int } from './util.js';
import { setOrderStatus, evalGroup, recountGroup, cancelOrder } from './orders.js';

/**
 * Payment module — provider is configurable (PAYMENT_PROVIDER). Until a real provider
 * (Payme / Click / Uzum ...) is chosen only the sandbox "mock" provider exists.
 * A payment becomes `paid` ONLY from a signed server-to-server webhook, never from the browser redirect.
 */
const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || 'dev-only-webhook-secret-change-me';
export const PROVIDER = process.env.PAYMENT_PROVIDER || 'mock';

export const sign = (raw) => crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
function verifySignature(raw, sig) {
  const a = Buffer.from(sign(raw));
  const b = Buffer.from(String(sig || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const providers = {
  mock: { checkoutUrl: (ref) => `/mock-pay/${ref}` },
};

export function createIntent(user, orderId) {
  return tx(() => {
    const o = db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').get(int(orderId, 'Buyurtma', { min: 1 }), user.id);
    if (!o) throw notFound('Buyurtma topilmadi');
    if (o.status !== 'pending_payment') throw conflict('Bu buyurtma uchun to‘lov talab qilinmaydi', 'not_payable');
    if (o.hold_expires_at < nowIso()) throw conflict('To‘lov muddati tugagan. Buyurtmani qaytadan rasmiylashtiring', 'hold_expired');
    const provider = providers[PROVIDER];
    if (!provider) throw bad('To‘lov provayderi sozlanmagan', 'provider_missing');
    let p = db.prepare("SELECT * FROM payments WHERE order_id=? AND status='pending'").get(o.id);
    if (!p) {
      const ref = crypto.randomBytes(16).toString('hex');
      const now = nowIso();
      const r = db
        .prepare('INSERT INTO payments(order_id,provider,provider_reference,amount,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
        .run(o.id, PROVIDER, ref, o.total, 'pending', now, now);
      p = db.prepare('SELECT * FROM payments WHERE id=?').get(r.lastInsertRowid);
      audit(user.id, 'payment.intent', 'payment', p.id, { orderId: o.id, amount: o.total });
    }
    return { paymentId: p.id, checkoutUrl: provider.checkoutUrl(p.provider_reference) };
  });
}

/** Handles a provider callback. `raw` is the exact request body (Buffer/string), `sig` its HMAC. */
export function handleWebhook(raw, sig) {
  if (!verifySignature(raw, sig)) throw new ApiError(401, 'bad_signature', 'Imzo noto‘g‘ri');
  let evt;
  try { evt = JSON.parse(raw.toString()); } catch { throw bad('Webhook JSON noto‘g‘ri'); }
  if (!['paid', 'failed'].includes(evt.status)) throw bad('Noma’lum holat');
  return tx(() => {
    const p = db.prepare('SELECT * FROM payments WHERE provider_reference=?').get(String(evt.reference));
    if (!p) throw notFound('To‘lov topilmadi');
    if (Number(evt.amount) !== p.amount) throw unprocessable('To‘lov summasi mos kelmadi', 'amount_mismatch');
    if (p.status !== 'pending') return { ok: true, duplicate: true };
    const now = nowIso();
    const order = db.prepare('SELECT * FROM orders WHERE id=?').get(p.order_id);
    if (evt.status === 'failed') {
      db.prepare("UPDATE payments SET status='failed', updated_at=? WHERE id=?").run(now, p.id);
      audit(null, 'payment.failed', 'payment', p.id);
      return { ok: true };
    }
    db.prepare("UPDATE payments SET status='paid', paid_at=?, updated_at=? WHERE id=?").run(now, now, p.id);
    audit(null, 'payment.paid', 'payment', p.id, { orderId: order.id, amount: p.amount });
    if (order.status === 'pending_payment') {
      setOrderStatus(order, 'confirmed', null, 'To‘lov tasdiqlandi');
      db.prepare("UPDATE group_members SET status='paid' WHERE order_id=? AND status='reserved'").run(order.id);
      db.prepare('UPDATE orders SET hold_expires_at=NULL WHERE id=?').run(order.id);
      if (order.group_id) { recountGroup(order.group_id); evalGroup(order.group_id); }
    } else {
      // paid after the hold expired / order cancelled -> money must go back
      db.prepare(
        `UPDATE payments SET status='refund_pending', refund_status='refund_pending', refund_amount=amount,
         refund_note='Muddati o‘tgan buyurtma uchun to‘lov keldi', updated_at=? WHERE id=?`,
      ).run(now, p.id);
    }
    return { ok: true };
  });
}

// ---------------------------------------------------------------- refunds (admin; manual unless provider automates)
export function adminRefund(actor, orderId, { action, amount, note }) {
  return tx(() => {
    const order = db.prepare('SELECT * FROM orders WHERE id=?').get(int(orderId, 'Buyurtma', { min: 1 }));
    if (!order) throw notFound('Buyurtma topilmadi');
    const pay = db.prepare("SELECT * FROM payments WHERE order_id=? AND status IN('paid','refund_pending','refunded') ORDER BY id DESC").get(order.id);
    if (!pay) throw conflict('Bu buyurtma bo‘yicha to‘langan to‘lov yo‘q', 'no_paid_payment');
    const now = nowIso();
    if (action === 'start') {
      if (pay.refund_status === 'refunded') throw conflict('Refund allaqachon bajarilgan');
      const amt = amount === undefined ? pay.amount : int(amount, 'Refund summasi', { min: 1, max: pay.amount });
      if (['pending_payment', 'confirmed', 'preparing', 'ready_for_delivery'].includes(order.status) && amt === pay.amount) {
        cancelOrder(order, actor.id, note || 'Admin tomonidan refund');
      } else if (order.status === 'out_for_delivery' && amt === pay.amount) {
        setOrderStatus(order, 'failed', actor.id, note || 'Yetkazib berilmadi, refund');
        db.prepare(`UPDATE payments SET status='refund_pending', refund_status='refund_pending', refund_amount=?, refund_note=?, updated_at=? WHERE id=?`)
          .run(amt, note ?? null, now, pay.id);
      } else {
        const full = amt === pay.amount;
        db.prepare(`UPDATE payments SET ${full ? "status='refund_pending'," : ''} refund_status='refund_pending', refund_amount=?, refund_note=?, updated_at=? WHERE id=?`)
          .run(amt, note ?? null, now, pay.id);
      }
      audit(actor.id, 'refund.start', 'payment', pay.id, { amount: amt, note });
    } else if (action === 'complete') {
      if (pay.refund_status !== 'refund_pending') throw conflict('Kutilayotgan refund yo‘q');
      const full = pay.refund_amount === pay.amount;
      db.prepare(`UPDATE payments SET ${full ? "status='refunded'," : ''} refund_status='refunded', updated_at=? WHERE id=?`).run(now, pay.id);
      audit(actor.id, 'refund.complete', 'payment', pay.id, { amount: pay.refund_amount });
    } else throw bad('action: start yoki complete bo‘lishi kerak');
    return db.prepare('SELECT * FROM payments WHERE id=?').get(pay.id);
  });
}
