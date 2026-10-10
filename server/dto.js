import { db, nowIso } from './db.js';
import { tiersOf, tierFor, nextTier } from './pricing.js';

export function productDto(p, { full = false } = {}) {
  const tiers = tiersOf(p.id);
  const entry = tiers[0].unit_price;
  const retailOk = p.retail_verified && p.retail_price;
  const g = db
    .prepare(
      "SELECT id FROM group_buys WHERE product_id=? AND status='open' AND ends_at>? ORDER BY ends_at LIMIT 1",
    )
    .get(p.id, nowIso());
  const dto = {
    id: p.id,
    slug: p.slug,
    title: p.title,
    emoji: p.emoji,
    imageUrl: p.image_url,
    unit: p.unit,
    packSize: p.pack_size,
    minIndividualQty: p.min_individual_qty,
    stockQty: p.stock_qty,
    status: p.status,
    categoryId: p.category_id,
    categoryName: p.category_name,
    sellerId: p.seller_id,
    sellerName: p.seller_name,
    tiers: tiers.map((t) => ({ minQty: t.min_qty, unitPrice: t.unit_price })),
    entryPrice: entry,
    bestPrice: tiers[tiers.length - 1].unit_price,
    retail: retailOk ? { price: p.retail_price, source: p.retail_source } : null,
    savingsPct: retailOk && p.retail_price > entry ? Math.round((1 - entry / p.retail_price) * 100) : null,
    openGroupId: g?.id ?? null,
  };
  if (full) {
    dto.description = p.description;
    dto.retailDraft = { price: p.retail_price, source: p.retail_source, verified: !!p.retail_verified };
  }
  return dto;
}

export const PRODUCT_SELECT = `SELECT p.*, c.name category_name, u.shop_name seller_name
  FROM products p JOIN categories c ON c.id=p.category_id JOIN users u ON u.id=p.seller_id`;

export function groupDto(g, userId) {
  const p = db.prepare(`${PRODUCT_SELECT} WHERE p.id=?`).get(g.product_id);
  const tiers = tiersOf(g.product_id);
  const cur = tierFor(tiers, Math.max(g.committed_qty, 1));
  const nxt = nextTier(tiers, Math.max(g.committed_qty, tiers[0].min_qty));
  const mine = userId
    ? db
        .prepare(
          "SELECT qty,status,order_id FROM group_members WHERE group_id=? AND user_id=? AND status IN('reserved','paid')",
        )
        .get(g.id, userId)
    : null;
  const members = db
    .prepare("SELECT COUNT(*) n FROM group_members WHERE group_id=? AND status IN('reserved','paid')")
    .get(g.id).n;
  return {
    id: g.id,
    status: g.status,
    targetQty: g.target_qty,
    committedQty: g.committed_qty,
    paidQty: g.paid_qty,
    remainingQty: Math.max(0, g.target_qty - g.committed_qty),
    minMemberQty: g.min_member_qty,
    startsAt: g.starts_at,
    endsAt: g.ends_at,
    closedAt: g.closed_at,
    members,
    currentUnitPrice: cur.unit_price,
    nextTier: nxt && {
      minQty: nxt.min_qty,
      unitPrice: nxt.unit_price,
      needed: nxt.min_qty - g.committed_qty,
    },
    joinable: g.status === 'open' && g.ends_at > nowIso(),
    product: productDto(p),
    mine: mine && { qty: mine.qty, status: mine.status, orderId: mine.order_id },
  };
}
