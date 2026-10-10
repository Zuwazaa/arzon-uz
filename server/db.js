import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const file = process.env.DB_FILE || path.join(process.cwd(), 'data', 'optom.db');
if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });

export const db = new DatabaseSync(file);
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');

let depth = 0;
/** Re-entrant write transaction (BEGIN IMMEDIATE => single writer, so counters/stock are race-free). */
export function tx(fn) {
  if (depth > 0) return fn();
  db.exec('BEGIN IMMEDIATE');
  depth++;
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    depth--;
  }
}

// Money = integer so'm. Times = UTC ISO strings.
db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL UNIQUE, email TEXT,
  password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN('buyer','seller','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','pending','blocked')),
  shop_name TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS zones(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, fee INTEGER NOT NULL CHECK(fee>=0), active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS addresses(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), label TEXT NOT NULL,
  zone_id INTEGER NOT NULL REFERENCES zones(id), street TEXT NOT NULL, details TEXT,
  is_default INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS categories(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, parent_id INTEGER, emoji TEXT, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS products(
  id INTEGER PRIMARY KEY, seller_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE, description TEXT NOT NULL DEFAULT '', category_id INTEGER NOT NULL REFERENCES categories(id),
  emoji TEXT NOT NULL DEFAULT '📦', unit TEXT NOT NULL, pack_size INTEGER NOT NULL DEFAULT 1 CHECK(pack_size>0),
  min_individual_qty INTEGER NOT NULL CHECK(min_individual_qty>0), stock_qty INTEGER NOT NULL CHECK(stock_qty>=0),
  retail_price INTEGER, retail_source TEXT, retail_verified INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','active','rejected','archived')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS price_tiers(
  id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  min_qty INTEGER NOT NULL CHECK(min_qty>0), unit_price INTEGER NOT NULL CHECK(unit_price>0),
  currency TEXT NOT NULL DEFAULT 'UZS', UNIQUE(product_id,min_qty));
CREATE TABLE IF NOT EXISTS group_buys(
  id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id), seller_id INTEGER NOT NULL REFERENCES users(id),
  target_qty INTEGER NOT NULL CHECK(target_qty>0), min_member_qty INTEGER NOT NULL DEFAULT 1,
  committed_qty INTEGER NOT NULL DEFAULT 0, paid_qty INTEGER NOT NULL DEFAULT 0,
  starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','threshold_met','successful','failed','cancelled')),
  pricing_policy TEXT NOT NULL DEFAULT 'final_tier', created_at TEXT NOT NULL, closed_at TEXT);
CREATE TABLE IF NOT EXISTS orders(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), seller_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN('individual','group')), group_id INTEGER REFERENCES group_buys(id),
  items TEXT NOT NULL, subtotal INTEGER NOT NULL, discount INTEGER NOT NULL DEFAULT 0,
  delivery_fee INTEGER NOT NULL, total INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'UZS',
  address_snapshot TEXT NOT NULL, zone_id INTEGER NOT NULL, delivery_slot TEXT,
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK(status IN('pending_payment','confirmed','preparing','ready_for_delivery','out_for_delivery','delivered','cancelled','failed')),
  idempotency_key TEXT, hold_expires_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(user_id, idempotency_key));
CREATE TABLE IF NOT EXISTS order_events(
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), status TEXT NOT NULL, note TEXT, actor_id INTEGER, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS group_members(
  id INTEGER PRIMARY KEY, group_id INTEGER NOT NULL REFERENCES group_buys(id), user_id INTEGER NOT NULL REFERENCES users(id),
  qty INTEGER NOT NULL CHECK(qty>0), unit_price_snapshot INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN('reserved','paid','cancelled')), order_id INTEGER REFERENCES orders(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS payments(
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), provider TEXT NOT NULL,
  provider_reference TEXT NOT NULL UNIQUE, amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','paid','failed','refund_pending','refunded')),
  paid_at TEXT, refund_status TEXT NOT NULL DEFAULT 'none' CHECK(refund_status IN('none','refund_pending','refunded')),
  refund_amount INTEGER NOT NULL DEFAULT 0, refund_note TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS deliveries(
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id), address_snapshot TEXT NOT NULL,
  zone_id INTEGER NOT NULL, fee INTEGER NOT NULL, scheduled_at TEXT, window_end TEXT, delivered_at TEXT,
  status TEXT NOT NULL DEFAULT 'not_scheduled' CHECK(status IN('not_scheduled','scheduled','out_for_delivery','delivered','delivery_failed')),
  courier TEXT, actual_cost INTEGER, note TEXT);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log(
  id INTEGER PRIMARY KEY, at TEXT NOT NULL, actor_id INTEGER, action TEXT NOT NULL, entity TEXT NOT NULL, entity_id INTEGER, detail TEXT);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status, category_id);
`);
try {
  db.exec('ALTER TABLE products ADD COLUMN image_url TEXT');
} catch {
  /* already applied */
}
db.exec(`
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_members_group ON group_members(group_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
`);

export const DEFAULT_SETTINGS = {
  group_duration_hours: 48, // PRD 3.3 — admin can change
  hold_minutes: 15, // payment window for reserved stock / group seat
  commission_pct: 5, // platform commission (to be confirmed by business)
  payment_fee_pct: 1.5, // payment provider fee estimate
  delivery_window_minutes: 120,
};
export function getSettings() {
  const out = { ...DEFAULT_SETTINGS };
  for (const r of db.prepare('SELECT key,value FROM settings').all()) out[r.key] = Number(r.value);
  return out;
}
export const nowIso = () => new Date().toISOString();
