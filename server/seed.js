import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { db, tx, nowIso } from './db.js';
import { hashPassword } from './auth.js';
import { slugify } from './util.js';
import { WIKI, imgUrl } from './product-images.js';
import { addExtraCatalog, addBakeryCatalog, addDrinksCatalog } from './catalog-extra.js';

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
  tx(() => {
    const user = (name, phone, role, hash, shop = null, status = 'active') =>
      Number(db.prepare('INSERT INTO users(name,phone,email,password_hash,role,status,shop_name,created_at) VALUES(?,?,?,?,?,?,?,?)')
        .run(name, phone, null, hash, role, status, shop, now).lastInsertRowid);
    const admin = user('Administrator', '+998900000001', 'admin', adminPw);

    for (const [name, fee] of [['Chilonzor', 15000], ['Yunusobod', 15000], ['Mirzo Ulug‘bek', 18000], ['Yakkasaroy', 20000]])
      db.prepare('INSERT INTO zones(name,fee) VALUES(?,?)').run(name, fee);

    const cats = {};
    for (const [name, emoji] of [
      ['Don va un mahsulotlari', '🌾'], ['Yog‘ va ziravorlar', '🫒'], ['Shakar va choy', '🍵'],
      ['Uy-ro‘zg‘or', '🧼'], ['Konservalar', '🥫'], ['Quruq mevalar va yong‘oqlar', '🥜'],
    ]) {
      cats[name] = Number(db.prepare('INSERT INTO categories(name,slug,emoji) VALUES(?,?,?)').run(name, slugify(name), emoji).lastInsertRowid);
    }
    if (!demo) return;

    const s1 = user('Akmal Karimov', '+998900000002', 'seller', pw, 'Baraka Optom', 'active');
    const s2 = user('Dilnoza Aliyeva', '+998900000003', 'seller', pw, 'Fayz Savdo', 'active');
    const buyer = user('Sardor Xaitov', '+998900000004', 'buyer', pw);
    db.prepare('INSERT INTO addresses(user_id,label,zone_id,street,details,is_default) VALUES(?,?,?,?,?,1)')
      .run(buyer, 'Uy', 1, 'Bunyodkor ko‘chasi, 12-uy', '3-qavat, 14-xonadon');

    const img = Object.fromEntries(Object.keys(WIKI).map((k) => [k, imgUrl(k)]));

    const product = (seller, title, cat, emoji, image, unit, pack, min, stock, retail, source, tiers, desc) => {
      const id = Number(db.prepare(
        `INSERT INTO products(seller_id,title,slug,description,category_id,emoji,image_url,unit,pack_size,min_individual_qty,stock_qty,
           retail_price,retail_source,retail_verified,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,1,'active',?,?)`)
        .run(seller, title, `tmp${Math.random()}`, desc, cats[cat], emoji, image, unit, pack, min, stock, retail, source, now, now).lastInsertRowid);
      db.prepare('UPDATE products SET slug=? WHERE id=?').run(`${slugify(title)}-${id}`, id);
      for (const [q, p] of tiers) db.prepare('INSERT INTO price_tiers(product_id,min_qty,unit_price) VALUES(?,?,?)').run(id, q, p);
      return id;
    };
    // ---- Don va un mahsulotlari
    const rice = product(s1, 'Guruch “Lazer” (devzira)', 'Don va un mahsulotlari', '🍚', img.rice, 'kg', 5, 25, 2000, 19000,
      'Chilonzor bozori bozor narxii, 2026-10 (tekshirilgan)', [[25, 16500], [100, 15500], [250, 14800]], 'Birinchi navli devzira guruch, 5 kg qadoqlarda. Palov uchun ideal.');
    product(s1, 'Un “Oliy nav”', 'Don va un mahsulotlari', '🥖', img.flour, 'kg', 10, 50, 3000, 7500,
      'Makro supermarket narxi, 2026-10 (tekshirilgan)', [[50, 6400], [200, 6000], [500, 5700]], '50 kg qoplarda emas, 10 kg qadoqlarda sotiladi.');
    product(s1, 'Makaron (spagetti) 1 kg', 'Don va un mahsulotlari', '🍝', img.pasta, 'dona', 10, 20, 1800,
      8500, 'Korzinka narxi, 2026-10 (tekshirilgan)', [[20, 7400], [100, 6900], [300, 6500]], 'Qattiq bug‘doy navidan, 1 kg qadoqlarda.');
    const buckwheat = product(s1, 'Grechka (murch) yormasi 800 g', 'Don va un mahsulotlari', '🌾', img.buckwheat, 'dona', 10, 20, 1500,
      9200, 'Chilonzor bozori narxi, 2026-10 (tekshirilgan)', [[20, 8100], [100, 7600], [250, 7200]], 'Tozalangan grechka yormasi, 800 g qadoqlarda.');
    const semolina = product(s1, 'Manka yormasi 1 kg', 'Don va un mahsulotlari', '🌾', img.semolina, 'dona', 10, 20, 1200,
      null, null, [[20, 6200], [100, 5800], [250, 5500]], 'Bug‘doydan tayyorlangan manka yormasi, 1 kg qadoqlarda.');

    // ---- Yog‘ va ziravorlar
    const oil = product(s2, 'Kungaboqar yog‘i 5 l', 'Yog‘ va ziravorlar', '🫒', img.sunflowerOil, 'dona', 1, 6, 600, 78000,
      'Korzinka narxi, 2026-10 (tekshirilgan)', [[6, 69000], [24, 66000], [60, 63500]], 'Tozalangan, hidsiz kungaboqar yog‘i, 5 litrlik shisha.');
    product(s2, 'Zaytun yog‘i (ekstra bakra) 1 l', 'Yog‘ va ziravorlar', '🫒', img.oliveOil, 'dona', 1, 6, 300,
      98000, 'Korzinka narxi, 2026-10 (tekshirilgan)', [[6, 87000], [24, 82000], [60, 78000]], 'Sovuq presslangan ekstra bakra zaytun yog‘i, 1 litrlik shisha.');
    product(s2, 'Osh tuzi (yodlangan) 1 kg', 'Yog‘ va ziravorlar', '🧂', img.salt, 'dona', 20, 40, 2500,
      2800, 'Chilonzor bozori narxi, 2026-10 (tekshirilgan)', [[40, 2300], [200, 2100], [500, 1950]], 'Yodlangan osh tuzi, 1 kg qadoqlarda.');
    product(s2, 'Qora murch (butun) 100 g', 'Yog‘ va ziravorlar', '🌶️', img.pepper, 'dona', 10, 20, 900,
      14000, 'Makro supermarket narxi, 2026-10 (tekshirilgan)', [[20, 12200], [100, 11500], [250, 10800]], 'Butun qora murch donalari, 100 g qadoqlarda.');
    const bayLeaf = product(s2, 'Lavr bargi (dafna) 50 g', 'Yog‘ va ziravorlar', '🍃', img.bayLeaf, 'dona', 20, 40, 700,
      null, null, [[40, 3100], [200, 2850], [500, 2600]], 'Quritilgan dafna bargi, 50 g qadoqlarda.');

    // ---- Shakar va choy
    const sugar = product(s2, 'Shakar (qand) 1 kg', 'Shakar va choy', '🍬', img.sugar, 'kg', 1, 20, 4000,
      null, null, [[20, 12400], [100, 11800], [300, 11200]], 'Oq kristall shakar.');
    product(s2, 'Qora choy 400 g', 'Shakar va choy', '🍵', img.blackTea, 'dona', 10, 20, 1600,
      24000, 'Korzinka narxi, 2026-10 (tekshirilgan)', [[20, 20500], [100, 19200], [250, 18000]], 'Seylon qora choyi, 400 g qadoqlarda.');
    product(s2, 'Yashil choy 400 g', 'Shakar va choy', '🍵', img.greenTea, 'dona', 10, 20, 1400,
      25000, 'Korzinka narxi, 2026-10 (tekshirilgan)', [[20, 21500], [100, 20200], [250, 19000]], 'Yirik bargli yashil choy, 400 g qadoqlarda.');
    product(s2, 'Erituvchi kofe 200 g', 'Shakar va choy', '☕', img.coffee, 'dona', 5, 10, 800,
      46000, 'Makro supermarket narxi, 2026-10 (tekshirilgan)', [[10, 40000], [50, 37500], [120, 35000]], 'Granula shaklidagi erituvchi qora kofe, 200 g bankada.');

    // ---- Uy-ro‘zg‘or
    const soap = product(s2, 'Kir yuvish kukuni 3 kg', 'Uy-ro‘zg‘or', '🧼', img.washingPowder, 'dona', 1, 4, 800, 52000,
      'Chilonzor bozori narxi, 2026-10 (tekshirilgan)', [[4, 44500], [20, 41500], [50, 39000]], 'Avtomat mashinalar uchun.');
    product(s2, 'Idish yuvish suyuqligi 500 ml', 'Uy-ro‘zg‘or', '🧴', img.dishSoap, 'dona', 6, 12, 1200,
      13500, 'Korzinka narxi, 2026-10 (tekshirilgan)', [[12, 11800], [60, 11000], [150, 10300]], 'Limon hidli idish yuvish suyuqligi, 500 ml flakonda.');
    product(s2, 'Tualet qog‘ozi (12 dona)', 'Uy-ro‘zg‘or', '🧻', img.toiletPaper, 'dona', 4, 8, 950,
      32000, 'Makro supermarket narxi, 2026-10 (tekshirilgan)', [[8, 27500], [40, 25500], [100, 24000]], 'Yumshoq, 2 qatlamli tualet qog‘ozi, 12 rulonli o‘ramda.');
    product(s2, 'Axlat paketlari (ro‘lik, 50 dona)', 'Uy-ro‘zg‘or', '🗑️', img.trashBags, 'dona', 10, 20, 1100,
      18000, 'Chilonzor bozori narxi, 2026-10 (tekshirilgan)', [[20, 15500], [100, 14200], [250, 13200]], '60 litrlik mustahkam axlat paketlari, 50 donali o‘ramda.');

    // ---- Konservalar
    const cannedTomato = product(s1, 'Pomidor konservasi 700 g', 'Konservalar', '🥫', img.cannedTomato, 'dona', 12, 24, 1300,
      11500, 'Korzinka narxi, 2026-10 (tekshirilgan)', [[24, 9800], [120, 9100], [300, 8500]], 'O‘z sharbatidagi pomidor konservasi, 700 g bankada.');
    product(s1, 'Konservalangan no‘xat 400 g', 'Konservalar', '🥫', img.cannedPeas, 'dona', 12, 24, 1100,
      9800, 'Makro supermarket narxi, 2026-10 (tekshirilgan)', [[24, 8400], [120, 7800], [300, 7300]], 'Yosh no‘xat konservasi, 400 g bankada.');
    product(s1, 'Konservalangan makkajo‘xori 340 g', 'Konservalar', '🌽', img.cannedCorn, 'dona', 12, 24, 1050,
      9200, 'Makro supermarket narxi, 2026-10 (tekshirilgan)', [[24, 7900], [120, 7300], [300, 6900]], 'Shirin makkajo‘xori doni konservasi, 340 g bankada.');
    product(s1, 'Baliq konservasi (sardalya) 240 g', 'Konservalar', '🐟', img.sardines, 'dona', 10, 20, 850,
      18500, 'Chilonzor bozori narxi, 2026-10 (tekshirilgan)', [[20, 15800], [100, 14600], [250, 13700]], 'O‘simlik yog‘idagi sardalya konservasi, 240 g bankada.');
    const pickles = product(s1, 'Tuzlangan bodring 800 g', 'Konservalar', '🥒', img.pickles, 'dona', 10, 20, 900,
      null, null, [[20, 13200], [100, 12300], [250, 11500]], 'An’anaviy tuzlangan bodring, 800 g bankada.');

    // ---- Quruq mevalar va yong‘oqlar
    product(s2, 'Tabiiy asal 1 kg', 'Quruq mevalar va yong‘oqlar', '🍯', img.honey, 'dona', 5, 10, 500,
      85000, 'Korzinka narxi, 2026-10 (tekshirilgan)', [[10, 74000], [50, 69000], [120, 65000]], 'Tog‘ gullaridan yig‘ilgan tabiiy asal, 1 kg bankada.');
    product(s2, 'Quritilgan o‘rik 500 g', 'Quruq mevalar va yong‘oqlar', '🍑', img.apricots, 'dona', 10, 20, 700,
      34000, 'Chilonzor bozori narxi, 2026-10 (tekshirilgan)', [[20, 29000], [100, 27000], [250, 25500]], 'Quyoshda quritilgan, yadrosiz o‘rik, 500 g qadoqlarda.');
    product(s2, 'Yong‘oq mag‘zi 500 g', 'Quruq mevalar va yong‘oqlar', '🥜', img.walnuts, 'dona', 10, 20, 600,
      58000, 'Makro supermarket narxi, 2026-10 (tekshirilgan)', [[20, 50000], [100, 46500], [250, 43500]], 'Tozalangan yong‘oq mag‘zi, 500 g qadoqlarda.');
    product(s2, 'Mayiz (qora) 500 g', 'Quruq mevalar va yong‘oqlar', '🍇', img.raisins, 'dona', 10, 20, 800,
      21000, 'Chilonzor bozori narxi, 2026-10 (tekshirilgan)', [[20, 18000], [100, 16800], [250, 15800]], 'Quritilgan qora mayiz, 500 g qadoqlarda.');
    const chickpeas = product(s2, 'No‘xat (quruq) 1 kg', 'Quruq mevalar va yong‘oqlar', '🫘', img.chickpeas, 'dona', 10, 20, 900,
      null, null, [[20, 14500], [100, 13500], [250, 12700]], 'Quruq no‘xat, 1 kg qadoqlarda.');

    for (const pid of [sugar, semolina, bayLeaf, pickles, chickpeas]) db.prepare('UPDATE products SET retail_verified=0 WHERE id=?').run(pid); // no verifiable retail price -> no "saving" shown

    const hrs = (h) => new Date(Date.now() + h * 3600_000).toISOString();
    const grp = (pid, seller, target, minMember, hours) =>
      db.prepare('INSERT INTO group_buys(product_id,seller_id,target_qty,min_member_qty,starts_at,ends_at,created_at) VALUES(?,?,?,?,?,?,?)')
        .run(pid, seller, target, minMember, now, hrs(hours), now);
    grp(rice, s1, 250, 5, 48);
    grp(oil, s2, 60, 1, 30);
    grp(soap, s2, 50, 1, 40);
    grp(buckwheat, s1, 100, 10, 36);
    grp(cannedTomato, s1, 120, 12, 60);
    addExtraCatalog();
    addBakeryCatalog();
    addDrinksCatalog();
  });
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--reset')) {
    const file = process.env.DB_FILE || path.join(process.cwd(), 'data', 'optom.db');
    db.close();
    for (const ext of ['', '-wal', '-shm']) fs.rmSync(file + ext, { force: true });
    console.log('Bazа o‘chirildi. Qayta ishga tushirganda demo ma’lumotlar yaratiladi (npm start).');
  } else console.log(seedIfEmpty() ? 'Seeded.' : 'Baza bo‘sh emas.');
}
