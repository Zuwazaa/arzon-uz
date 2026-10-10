# Arzon.uz — ishga tushirish bo‘yicha ko‘rsatmalar

Bu papkada Arzon.uz MVP veb-ilovasi bor (PRD v1.0 asosida). Quyida uni kompyuterda ishga tushirish va ishlatish uchun hamma narsa.

## 1. Nima kerak
- **Node.js 22.5 yoki undan yangi** (tavsiya: 24). Yuklab olish: https://nodejs.org
- Tekshirish: terminalda `node -v` — `v22.5` yoki yuqori chiqishi kerak.
- Boshqa dastur (baza serveri va h.k.) kerak emas — baza SQLite, fayl ko‘rinishida.

## 2. Ishga tushirish
Papka ichida terminal (PowerShell yoki CMD) oching:

```bash
npm install
npm start
```

Brauzerda oching: **http://localhost:3000**

Birinchi ishga tushishda demo ma’lumotlar (mahsulotlar, guruhlar, hisoblar) avtomatik yaratiladi. Baza `data/optom.db` faylida saqlanadi.

Boshqa port kerak bo‘lsa (PowerShell): `$env:PORT=4000; npm start`

## 3. Demo hisoblar
Hammasining paroli: `demo12345`

| Rol | Telefon |
|---|---|
| Administrator | +998900000001 |
| Sotuvchi (Baraka Optom) | +998900000002 |
| Sotuvchi (Fayz Savdo) | +998900000003 |
| Xaridor | +998900000004 |

Administrator paneli: `/admin`, sotuvchi paneli: `/seller`.

## 4. Sinab ko‘rish (xaridor oqimi)
1. Xaridor sifatida kiring → **Guruhlar** → biror guruhni oching → **Qo‘shilish**.
2. Checkout’da manzilni tanlang, shartlarga rozilik bering → **Tasdiqlash va to‘lash**.
3. Ochilgan **sandbox to‘lov sahifasida** “To‘lash (muvaffaqiyatli)” tugmasini bosing (haqiqiy pul yechilmaydi).
4. Buyurtma “Tasdiqlangan” bo‘ladi. Guruh limiti to‘lgach, sotuvchi buyurtmani “tayyorlash”, admin esa yetkazib berishni rejalashtiradi.

## 5. Testlar
```bash
npm test
```
5 ta to‘liq oqim testi (buyurtma, zaxira, parallel guruh qo‘shilishlari, guruh muddati tugashi, yetkazib berish) o‘tishi kerak.

## 6. Bazani noldan boshlash
```bash
npm run seed
npm start
```
(`data/optom.db` o‘chiriladi, keyingi ishga tushishda demo ma’lumot qayta yaratiladi.)

## 7. Muhit o‘zgaruvchilari
| O‘zgaruvchi | Vazifa |
|---|---|
| `PORT` | Port (standart 3000) |
| `DB_FILE` | Baza fayli yo‘li |
| `NODE_ENV=production` | Productionda cookie `Secure` bo‘ladi (HTTPS kerak) |
| `SEED_DEMO=0` | Demo mahsulot/hisoblarsiz — faqat admin, zonalar, kategoriyalar |
| `ADMIN_PASSWORD` | Admin paroli (demo parol o‘rniga) |
| `DEMO_PASSWORD` | Demo hisoblar paroli |
| `PAYMENT_PROVIDER` | Hozircha faqat `mock` |
| `PAYMENT_WEBHOOK_SECRET` | Webhook imzo kaliti — productionda albatta o‘zgartiring |
| `TRUST_PROXY=1` | Nginx/proxy orqasida ishlaganda |

## 8. Productionga chiqarishdan oldin (muhim)
- Demo parollarni almashtiring yoki `SEED_DEMO=0` + `ADMIN_PASSWORD` ishlating.
- `PAYMENT_WEBHOOK_SECRET` ni uzun tasodifiy qiymatga o‘zgartiring.
- HTTPS yoqing va `NODE_ENV=production` qo‘ying.
- **Haqiqiy to‘lov provayderi (Payme, Click, Uzum…) hali ulanmagan** — hozir sandbox. Provayder tanlangach `server/payments.js` dagi `providers` ga qo‘shiladi.
- Komissiya (5%), to‘lov komissiyasi (1.5%), yetkazish vaqt oralig‘i (120 daq) — taxminiy qiymatlar; Admin → Sozlamalar’da real shartlarga o‘zgartiring.
- Bazadan (`data/optom.db`) muntazam nusxa oling.

## 9. Papka tuzilmasi
```
server/        backend (Express): index.js, db.js, orders.js, payments.js, routes/...
public/        frontend (index.html, style.css, app.js, shop.js, account.js, seller.js, admin.js)
test/          avtomatik testlar
data/          SQLite baza (avtomatik yaratiladi)
README.md      qisqacha texnik tavsif
Optom_uz_PRD.docx   asl PRD
```

## 10. Asosiy qarorlar (PRD ochiq savollari bo‘yicha)
- Pilot: Toshkent, 4 ta yetkazish zonasi (har biri qat’iy narx; admin o‘zgartiradi).
- Guruhga qo‘shilganda joy va zaxira 15 daqiqaga band qilinadi; to‘lov shu muddatda.
- Guruh muvaffaqiyatli bo‘lsa, yakuniy narx umumiy miqdorga qarab hisoblanadi; ilgari yuqori narxda to‘lagan ishtirokchilarga farq qaytariladi.
- Muddat tugab limit to‘lmasa, guruh `failed` bo‘ladi va to‘lovlar qaytarish ro‘yxatiga tushadi.
- Refund hozir qo‘lda: Admin → Buyurtmalar → “Refund boshlash” → “Refund bajarildi”.
- “Tejash” summasi faqat admin tasdiqlagan bozor narxi bo‘lsa ko‘rsatiladi.
- Sotuvchi xaridorning telefon va manzilini ko‘rmaydi.
- Qilinmagan: bir manzilga bir nechta buyurtmani birlashtirish (FR-15, P2).
