import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { db, tx, nowIso } from './db.js';
import { slugify } from './util.js';
import { WIKI, WIKI_BASE, imgUrl } from './product-images.js';

const CATS = [['So‘nggi qo‘ng‘iroq va bitiruv', '🎓'], ['Kantstovarlar', '✏️'], ['To‘y va tantana uchun', '🎉']];
const SRC = (shop) => `${shop} narxi, 2026-10 (tekshirilgan)`;

const makeProduct = (cats, now) => (seller, title, cat, emoji, key, unit, pack, min, stock, retail, source, tiers, desc) => {
  const id = Number(db.prepare(
    `INSERT INTO products(seller_id,title,slug,description,category_id,emoji,image_url,unit,pack_size,min_individual_qty,stock_qty,
       retail_price,retail_source,retail_verified,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,1,'active',?,?)`)
    .run(seller, title, `tmp${Math.random()}`, desc, cats[cat], emoji, imgUrl(key), unit, pack, min, stock, retail, source, now, now).lastInsertRowid);
  db.prepare('UPDATE products SET slug=? WHERE id=?').run(`${slugify(title)}-${id}`, id);
  for (const [q, p] of tiers) db.prepare('INSERT INTO price_tiers(product_id,min_qty,unit_price) VALUES(?,?,?)').run(id, q, p);
  return id;
};
const addGroup = (pid, seller, target, minMember, hours, now) =>
  db.prepare('INSERT INTO group_buys(product_id,seller_id,target_qty,min_member_qty,starts_at,ends_at,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(pid, seller, target, minMember, now, new Date(Date.now() + hours * 3600_000).toISOString(), now);

/** Existing rows that still point at Wikimedia get the locally hosted copy instead. */
export function localizeImages() {
  const upd = db.prepare('UPDATE products SET image_url=? WHERE image_url=?');
  let n = 0;
  for (const [key, p] of Object.entries(WIKI)) n += Number(upd.run(imgUrl(key), WIKI_BASE + p).changes);
  return n;
}

/** Adds the graduation / stationery / wedding catalog once (safe to call repeatedly). */
export function addExtraCatalog() {
  const sellers = db.prepare("SELECT id FROM users WHERE role='seller' ORDER BY id").all();
  if (!sellers.length) return false;
  if (db.prepare('SELECT 1 FROM categories WHERE slug=?').get(slugify(CATS[0][0]))) return false;
  const s1 = sellers[0].id, s2 = (sellers[1] || sellers[0]).id;
  const now = nowIso();
  tx(() => {
    const cats = {};
    for (const [name, emoji] of CATS) cats[name] = Number(db.prepare('INSERT INTO categories(name,slug,emoji) VALUES(?,?,?)').run(name, slugify(name), emoji).lastInsertRowid);
    const [GRAD, STAT, PARTY] = CATS.map((c) => c[0]);
    const product = makeProduct(cats, now);

    // So‘nggi qo‘ng‘iroq va bitiruv
    const lenta11 = product(s2, 'Bitiruvchi lentasi “11-sinf”', GRAD, '🎗️', 'sablay', 'dona', 1, 10, 800, 25000, SRC('Chilonzor bozori'),
      [[10, 19500], [50, 17000], [150, 15000]], 'Atlas bitiruvchi lentasi, 11-sinf so‘nggi qo‘ng‘iroqi uchun.');
    product(s2, 'Bitiruvchi lentasi “9-sinf”', GRAD, '🎗️', 'baldric', 'dona', 1, 10, 800, 22000, SRC('Chilonzor bozori'),
      [[10, 17000], [50, 15000], [150, 13000]], 'Atlas bitiruvchi lentasi, 9-sinf bitiruvchilari uchun.');
    product(s2, 'Bitiruvchi shapkasi (akademik)', GRAD, '🎓', 'gradCap', 'dona', 1, 10, 400, 38000, SRC('Makro supermarket'),
      [[10, 30000], [50, 26500], [100, 24000]], 'To‘rtburchak tepali bitiruvchi shapkasi, bir o‘lchamli.');
    product(s2, 'Diplom va sertifikat papkasi', GRAD, '📜', 'diploma', 'dona', 5, 20, 1500, 16000, SRC('Chilonzor bozori'),
      [[20, 11500], [100, 10000], [300, 9000]], 'Bitiruv guvohnomalari va sertifikatlar uchun qattiq muqovali papka.');

    // Kantstovarlar
    product(s1, 'Daftar 48 varaq (katak)', STAT, '📓', 'notebooks', 'dona', 10, 50, 8000, 4500, SRC('Chilonzor bozori'),
      [[50, 3200], [300, 2900], [1000, 2600]], 'Maktab uchun 48 varaqli katakli daftar, rangli muqovada.');
    product(s1, 'Sharikli ruchka (ko‘k), quti 50 dona', STAT, '🖊️', 'pens', 'quti', 1, 5, 600, 60000, SRC('Makro supermarket'),
      [[5, 42000], [20, 38000], [60, 34000]], 'Ko‘k siyohli sharikli ruchkalar, bir qutida 50 dona.');
    product(s1, 'Rangli qalamlar 12 rang', STAT, '🖍️', 'pencils', 'dona', 6, 12, 2500, 18000, SRC('Korzinka'),
      [[12, 13500], [60, 12500], [200, 11500]], 'Yog‘ochdan tayyorlangan 12 xil rangli qalamlar to‘plami.');
    product(s1, 'Flomasterlar 12 rang', STAT, '🖍️', 'markers', 'dona', 6, 12, 2000, 16000, SRC('Korzinka'),
      [[12, 11800], [60, 10800], [200, 9800]], 'Yuviladigan siyohli 12 rangli flomasterlar to‘plami.');
    const ryukzak = product(s1, 'Maktab ryukzagi', STAT, '🎒', 'backpack', 'dona', 1, 5, 300, 125000, SRC('Makro supermarket'),
      [[5, 95000], [20, 88000], [50, 82000]], 'Keng, ortopedik orqa qismli maktab ryukzagi.');

    // To‘y va tantana uchun
    product(s2, 'Bir martalik stakanlar (50 dona)', PARTY, '🥤', 'cups', 'dona', 10, 20, 3000, 9000, SRC('Chilonzor bozori'),
      [[20, 6700], [100, 6100], [300, 5600]], 'Bir martalik stakanlar, bir o‘ramda 50 dona.');
    product(s2, 'Salfetkalar (100 dona)', PARTY, '🧻', 'napkins', 'dona', 10, 20, 4000, 6500, SRC('Chilonzor bozori'),
      [[20, 4600], [100, 4100], [300, 3700]], 'Dasturxon uchun qog‘oz salfetkalar, o‘ramda 100 dona.');
    product(s2, 'To‘y shamlari (10 dona)', PARTY, '🕯️', 'candles', 'dona', 5, 10, 900, 22000, SRC('Chilonzor bozori'),
      [[10, 16500], [50, 14800], [150, 13200]], 'Dasturxon va tantana bezagi uchun oq shamlar, 10 dona.');
    product(s2, 'Bengal o‘tlari (10 dona)', PARTY, '✨', 'sparklers', 'dona', 10, 20, 1500, 14000, SRC('Chilonzor bozori'),
      [[20, 9800], [100, 8800], [300, 7900]], 'Tantana uchun bengal o‘tlari. Faqat ochiq havoda va kattalar nazoratida ishlating.');
    product(s2, 'Konfeti pushkasi (5 dona)', PARTY, '🎊', 'confetti', 'dona', 5, 10, 700, 30000, SRC('Chilonzor bozori'),
      [[10, 22500], [50, 20000], [150, 18000]], 'Rangli konfeti otadigan pushka, to‘y va bitiruv bayrami uchun.');

    const hrs = (h) => new Date(Date.now() + h * 3600_000).toISOString();
    const grp = (pid, seller, target, minMember, hours) =>
      db.prepare('INSERT INTO group_buys(product_id,seller_id,target_qty,min_member_qty,starts_at,ends_at,created_at) VALUES(?,?,?,?,?,?,?)')
        .run(pid, seller, target, minMember, now, hrs(hours), now);
    grp(lenta11, s2, 150, 10, 72);
    grp(ryukzak, s1, 40, 5, 60);
  });
  return true;
}

/** Adds sweets and bakery categories once (safe to call repeatedly). */
export function addBakeryCatalog() {
  const sellers = db.prepare("SELECT id FROM users WHERE role='seller' ORDER BY id").all();
  if (!sellers.length) return false;
  if (db.prepare('SELECT 1 FROM categories WHERE slug=?').get(slugify('Shirinliklar'))) return false;
  const s1 = sellers[0].id, s2 = (sellers[1] || sellers[0]).id;
  const now = nowIso();
  tx(() => {
    const cats = {};
    for (const [name, emoji] of [['Shirinliklar', '🍬'], ['Pishiriqlar', '🥐']]) cats[name] = Number(db.prepare('INSERT INTO categories(name,slug,emoji) VALUES(?,?,?)').run(name, slugify(name), emoji).lastInsertRowid);
    const product = makeProduct(cats, now);
    const SW = 'Shirinliklar', BK = 'Pishiriqlar';
    const konfet = product(s2, 'Konfet assorti 1 kg', SW, '🍬', 'candies', 'dona', 5, 10, 1200, 38000, SRC('Chilonzor bozori'),
      [[10, 29000], [50, 26500], [150, 24000]], 'Turli xil mazali konfetlar aralashmasi, 1 kg qadoqda.');
    product(s2, 'Shokolad plitkasi 90 g, quti 20 dona', SW, '🍫', 'chocolate', 'quti', 1, 2, 300, 150000, SRC('Makro supermarket'),
      [[2, 112000], [10, 104000], [30, 96000]], 'Sut shokoladi plitkalari, bir qutida 20 dona.');
    const pechenye = product(s2, 'Pechenye “Assorti” 1 kg', SW, '🍪', 'biscuits', 'dona', 5, 10, 1500, 32000, SRC('Korzinka'),
      [[10, 24500], [50, 22500], [150, 20500]], 'Qummoq va shirin pechenyelar aralashmasi, 1 kg qadoqda.');
    product(s2, 'Vafli vanilli 200 g', SW, '🧇', 'wafers', 'dona', 10, 20, 3000, 9000, SRC('Korzinka'),
      [[20, 6800], [100, 6200], [300, 5700]], 'Vanil ta’mli qatlamli vafli, 200 g.');
    product(s2, 'Xalva 500 g', SW, '🥜', 'halva', 'dona', 5, 10, 900, 28000, SRC('Chilonzor bozori'),
      [[10, 21500], [50, 19500], [150, 18000]], 'An’anaviy xalva, 500 g qadoqda.');
    product(s2, 'Zefir 300 g', SW, '🍥', 'marshmallow', 'dona', 10, 20, 2000, 14000, SRC('Makro supermarket'),
      [[20, 10500], [100, 9600], [300, 8800]], 'Yumshoq zefir, 300 g qadoqda.');
    product(s2, 'Nabot (kristall shakar) 500 g', SW, '💎', 'rockCandy', 'dona', 10, 20, 2000, 20000, SRC('Chilonzor bozori'),
      [[20, 15200], [100, 14000], [300, 12800]], 'Choy bilan ichiladigan nabot, 500 g qadoqda.');
    product(s2, 'Pahlava 1 kg', SW, '🍯', 'baklava', 'dona', 1, 5, 400, 90000, SRC('Chilonzor bozori'),
      [[5, 69000], [20, 64000], [60, 60000]], 'Yong‘oqli va asalli pahlava, 1 kg.');

    product(s1, 'Tandir non (patir)', BK, '🫓', 'tandirNon', 'dona', 10, 30, 3000, 7000, SRC('Chorsu bozori'),
      [[30, 5200], [150, 4800], [500, 4400]], 'Tandirda pishirilgan yangi patir non, dona narxida.');
    product(s1, 'Lavash (yupqa non), 5 dona', BK, '🫓', 'lavash', 'dona', 10, 20, 2500, 9000, SRC('Korzinka'),
      [[20, 6600], [100, 6000], [300, 5500]], 'Yupqa lavash non, bir o‘ramda 5 dona.');
    product(s1, 'Kruassan (qaymoqli)', BK, '🥐', 'croissant', 'dona', 10, 30, 1500, 8000, SRC('Makro supermarket'),
      [[30, 5800], [150, 5300], [400, 4800]], 'Qaymoqli to‘ldirmali yangi kruassan, dona narxida.');
    product(s1, 'Shokoladli tort 1 kg', BK, '🎂', 'cake', 'dona', 1, 3, 120, 140000, SRC('Chilonzor bozori'),
      [[3, 110000], [10, 102000], [30, 95000]], 'Shokoladli qatlamli tort, 1 kg. Buyurtmaga qarab tayyorlanadi.');
    product(s1, 'Keks (maffin)', BK, '🧁', 'muffins', 'dona', 10, 30, 2000, 6000, SRC('Korzinka'),
      [[30, 4300], [150, 3900], [400, 3500]], 'Mayda keks (maffin), dona narxida.');
    product(s1, 'Asalli pryanik 500 g', BK, '🍘', 'gingerbread', 'dona', 5, 10, 800, 22000, SRC('Chilonzor bozori'),
      [[10, 16500], [50, 15000], [150, 13800]], 'Asalli pryanik, 500 g qadoqda.');

    addGroup(konfet, s2, 200, 10, 48, now);
    addGroup(pechenye, s2, 150, 10, 72, now);
  });
  return true;
}

/** Adds the drinks category once (safe to call repeatedly). */
export function addDrinksCatalog() {
  const sellers = db.prepare("SELECT id FROM users WHERE role='seller' ORDER BY id").all();
  if (!sellers.length) return false;
  if (db.prepare('SELECT 1 FROM categories WHERE slug=?').get(slugify('Ichimliklar'))) return false;
  const s2 = (sellers[1] || sellers[0]).id;
  const now = nowIso();
  tx(() => {
    const cats = { Ichimliklar: Number(db.prepare('INSERT INTO categories(name,slug,emoji) VALUES(?,?,?)').run('Ichimliklar', slugify('Ichimliklar'), '🥤').lastInsertRowid) };
    const product = makeProduct(cats, now);
    const IC = 'Ichimliklar';
    const suv = product(s2, 'Mineral suv 1,5 l, quti 6 dona', IC, '💧', 'mineralWater', 'quti', 1, 5, 900, 24000, SRC('Korzinka'),
      [[5, 17500], [20, 16000], [60, 14800]], 'Gazsiz mineral suv, 1,5 litrlik shisha, bir qutida 6 dona.');
    product(s2, 'Olma sharbati 1 l, quti 12 dona', IC, '🧃', 'appleJuice', 'quti', 1, 3, 300, 110000, SRC('Makro supermarket'),
      [[3, 84000], [10, 78000], [30, 73000]], 'Tabiiy olma sharbati, 1 litrlik paket, bir qutida 12 dona.');
    product(s2, 'Apelsin sharbati 1 l, quti 12 dona', IC, '🍊', 'orangeJuice', 'quti', 1, 3, 300, 125000, SRC('Makro supermarket'),
      [[3, 96000], [10, 89000], [30, 83000]], 'Apelsin sharbati, 1 litrlik paket, bir qutida 12 dona.');
    product(s2, 'Limonad 1,5 l, quti 6 dona', IC, '🥤', 'lemonade', 'quti', 1, 5, 600, 52000, SRC('Korzinka'),
      [[5, 38500], [20, 35500], [60, 33000]], 'Gazlangan limonad, 1,5 litrlik shisha, bir qutida 6 dona.');
    addGroup(suv, s2, 100, 5, 72, now);
  });
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('Mahalliy rasmga o‘tkazilgan mahsulotlar:', localizeImages());
  console.log(addExtraCatalog() ? 'Bitiruv, kantstovar va to‘y bo‘limlari qo‘shildi.' : 'Bitiruv, kantstovar va to‘y bo‘limlari allaqachon bor.');
  console.log(addDrinksCatalog() ? 'Ichimliklar qo‘shildi.' : 'Ichimliklar allaqachon bor.');
  console.log(addBakeryCatalog() ? 'Shirinliklar va pishiriqlar qo‘shildi.' : 'Shirinliklar va pishiriqlar allaqachon bor.');
}
