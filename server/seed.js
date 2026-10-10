import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { db, dbFile, tx, nowIso } from './db.js';
import { hashPassword } from './auth.js';
import { PACKS } from './catalog-data.js';
import { insertCategories, addPackProducts, installPack } from './catalog.js';

const ZONES = [
  ['Chilonzor', 15000],
  ['Yunusobod', 15000],
  ['Mirzo Ulug‘bek', 18000],
  ['Yakkasaroy', 20000],
];

/**
 * Demo data for the pilot. Accounts (password from DEMO_PASSWORD, default "demo12345"):
 *   admin  +998900000001   seller +998900000002 / +998900000003   buyer +998900000004
 * In production set SEED_DEMO=0 and ADMIN_PASSWORD to bootstrap only the admin + zones/categories.
 */
export function seedIfEmpty() {
  if (db.prepare('SELECT COUNT(*) n FROM users').get().n > 0) return false;
  const demo = process.env.SEED_DEMO !== '0';
  const pw = hashPassword(process.env.DEMO_PASSWORD || 'demo12345');
  const adminPw = process.env.ADMIN_PASSWORD ? hashPassword(process.env.ADMIN_PASSWORD) : pw;
  const now = nowIso();
  const [basePack, ...extraPacks] = PACKS;

  tx(() => {
    const addUser = (name, phone, role, hash, shop = null) =>
      Number(
        db
          .prepare(
            'INSERT INTO users(name,phone,email,password_hash,role,status,shop_name,created_at) VALUES(?,?,?,?,?,?,?,?)',
          )
          .run(name, phone, null, hash, role, 'active', shop, now).lastInsertRowid,
      );
    addUser('Administrator', '+998900000001', 'admin', adminPw);
    for (const [name, fee] of ZONES) db.prepare('INSERT INTO zones(name,fee) VALUES(?,?)').run(name, fee);
    const categoryIds = insertCategories(basePack.categories);
    if (!demo) return;

    const seller1 = addUser('Akmal Karimov', '+998900000002', 'seller', pw, 'Baraka Optom');
    const seller2 = addUser('Dilnoza Aliyeva', '+998900000003', 'seller', pw, 'Fayz Savdo');
    const buyer = addUser('Sardor Xaitov', '+998900000004', 'buyer', pw);
    db.prepare(
      'INSERT INTO addresses(user_id,label,zone_id,street,details,is_default) VALUES(?,?,?,?,?,1)',
    ).run(buyer, 'Uy', 1, 'Bunyodkor ko‘chasi, 12-uy', '3-qavat, 14-xonadon');

    addPackProducts(basePack, categoryIds, [seller1, seller2]);
    for (const pack of extraPacks) installPack(pack);
  });
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--reset')) {
    db.close();
    for (const ext of ['', '-wal', '-shm']) fs.rmSync(dbFile + ext, { force: true });
    console.log('Bazа o‘chirildi. Qayta ishga tushirganda demo ma’lumotlar yaratiladi (npm start).');
  } else console.log(seedIfEmpty() ? 'Seeded.' : 'Baza bo‘sh emas.');
}
