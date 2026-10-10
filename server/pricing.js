import { db } from './db.js';
import { bad } from './util.js';

export const tiersOf = (productId) =>
  db
    .prepare('SELECT id, min_qty, unit_price FROM price_tiers WHERE product_id=? ORDER BY min_qty')
    .all(productId);

/** Tier that applies at qty. Below the first tier the entry (first) tier price applies. */
export function tierFor(tiers, qty) {
  let t = tiers[0];
  for (const x of tiers) if (qty >= x.min_qty) t = x;
  return t;
}
export const nextTier = (tiers, qty) => tiers.find((x) => x.min_qty > qty) || null;

export function validateTiers(tiers, minIndividualQty) {
  if (!Array.isArray(tiers) || tiers.length < 1 || tiers.length > 8)
    throw bad('Kamida 1 ta, ko‘pi bilan 8 ta narx bosqichi kerak');
  const out = tiers.map((t) => ({ min_qty: Number(t.minQty), unit_price: Number(t.unitPrice) }));
  for (const t of out) {
    if (!Number.isInteger(t.min_qty) || t.min_qty < 1 || !Number.isInteger(t.unit_price) || t.unit_price < 1)
      throw bad('Narx bosqichlari butun musbat sonlar bo‘lishi kerak');
  }
  out.sort((a, b) => a.min_qty - b.min_qty);
  for (let i = 1; i < out.length; i++) {
    if (out[i].min_qty === out[i - 1].min_qty) throw bad('Bosqichlar minimal miqdori takrorlanmasligi kerak');
    if (out[i].unit_price >= out[i - 1].unit_price)
      throw bad('Miqdor oshgani sari birlik narxi kamayishi kerak');
  }
  if (out[0].min_qty > minIndividualQty)
    throw bad('Birinchi bosqich minimal shaxsiy buyurtma miqdorini qamrab olishi kerak');
  return out;
}
