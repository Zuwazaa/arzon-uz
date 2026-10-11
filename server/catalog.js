import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { db, tx, nowIso, newRoomCode } from './db.js';
import { slugify } from './util.js';
import { WIKI, WIKI_BASE, imgUrl } from './product-images.js';
import { PACKS } from './catalog-data.js';

const HOUR_MS = 3600_000;
const priceSource = (shop) => (shop ? `${shop} narxi, 2026-10 (tekshirilgan)` : null);

/** Inserts [name, emoji] pairs and returns a { name: id } map. */
export function insertCategories(list) {
  const insert = db.prepare('INSERT INTO categories(name,slug,emoji) VALUES(?,?,?)');
  return Object.fromEntries(
    list.map(([name, emoji]) => [name, Number(insert.run(name, slugify(name), emoji).lastInsertRowid)]),
  );
}

function insertProduct(p, categoryIds, sellerId, now) {
  const id = Number(
    db
      .prepare(
        `INSERT INTO products(seller_id,title,slug,description,category_id,emoji,image_url,unit,pack_size,
           min_individual_qty,stock_qty,retail_price,retail_source,retail_verified,status,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?)`,
      )
      .run(
        sellerId,
        p.title,
        `pending-${randomUUID()}`, // the real slug needs the new row id
        p.desc,
        categoryIds[p.category],
        p.emoji,
        imgUrl(p.image),
        p.unit,
        p.pack,
        p.min,
        p.stock,
        p.retail,
        priceSource(p.shop),
        p.retail ? 1 : 0, // no verifiable market price -> no "saving" is shown
        now,
        now,
      ).lastInsertRowid,
  );
  db.prepare('UPDATE products SET slug=? WHERE id=?').run(`${slugify(p.title)}-${id}`, id);
  const insertTier = db.prepare('INSERT INTO price_tiers(product_id,min_qty,unit_price) VALUES(?,?,?)');
  for (const [minQty, unitPrice] of p.tiers) insertTier.run(id, minQty, unitPrice);
  return id;
}

function insertGroup(productId, sellerId, [target, minMember, hours], now) {
  const endsAt = new Date(Date.now() + hours * HOUR_MS).toISOString();
  db.prepare(
    'INSERT INTO group_buys(product_id,seller_id,target_qty,min_member_qty,starts_at,ends_at,created_at,code) VALUES(?,?,?,?,?,?,?,?)',
  ).run(productId, sellerId, target, minMember, now, endsAt, now, newRoomCode());
}

/** Adds a pack's products, then its groups. `sellerIds[0]` / `sellerIds[1]` are the first two sellers. */
export function addPackProducts(pack, categoryIds, sellerIds) {
  const now = nowIso();
  const inserted = new Map();
  for (const p of pack.products) {
    const sellerId = sellerIds[p.seller - 1];
    inserted.set(p.title, { id: insertProduct(p, categoryIds, sellerId, now), sellerId });
  }
  for (const [title, ...rules] of pack.groups) {
    const { id, sellerId } = inserted.get(title);
    insertGroup(id, sellerId, rules, now);
  }
}

/** Installs an extra pack once (safe to call repeatedly); false when it is already there or no seller exists. */
export function installPack(pack) {
  const sellers = db.prepare("SELECT id FROM users WHERE role='seller' ORDER BY id").all();
  if (!sellers.length) return false;
  if (db.prepare('SELECT 1 FROM categories WHERE slug=?').get(slugify(pack.categories[0][0]))) return false;
  const sellerIds = [sellers[0].id, (sellers[1] ?? sellers[0]).id];
  tx(() => addPackProducts(pack, insertCategories(pack.categories), sellerIds));
  return true;
}

/** Existing rows that still point at Wikimedia get the locally hosted copy instead. */
export function localizeImages() {
  const update = db.prepare('UPDATE products SET image_url=? WHERE image_url=?');
  let changed = 0;
  for (const [key, wikiPath] of Object.entries(WIKI)) {
    changed += Number(update.run(imgUrl(key), WIKI_BASE + wikiPath).changes);
  }
  return changed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('Mahalliy rasmga o‘tkazilgan mahsulotlar:', localizeImages());
  for (const pack of PACKS.slice(1))
    console.log(installPack(pack) ? `${pack.name} qo‘shildi.` : `${pack.name} allaqachon bor.`);
}
