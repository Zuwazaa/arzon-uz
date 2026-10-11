# Arzon.uz — MVP (PRD v1.0)

Ulgurji va guruhli xarid web platformasi. Node.js 22.5+ (built-in `node:sqlite`), Express, vanilla-JS SPA (o‘zbek tilida, mobile-first).

```bash
npm install
npm start          # http://localhost:3000  (birinchi ishga tushirishda demo ma'lumotlar yaratiladi)
npm test           # end-to-end testlar (xotiradagi baza)
npm run seed       # bazani o'chiradi; qayta `npm start` demo ma'lumotni qayta yaratadi
```

Demo hisoblar (parol: `demo12345`): admin `+998900000001`, sotuvchilar `+998900000002`, `+998900000003`, xaridor `+998900000004`.

## Muhit o‘zgaruvchilari
`PORT`, `DB_FILE`, `NODE_ENV=production`, `SEED_DEMO=0` (faqat admin/zonalar/kategoriyalar), `ADMIN_PASSWORD`, `DEMO_PASSWORD`,
`PAYMENT_PROVIDER` (hozircha faqat `mock`), `PAYMENT_WEBHOOK_SECRET`, `TRUST_PROXY=1`.

## PRD bo‘yicha qamrov
| PRD | Joyi |
|---|---|
| FR-01…03 katalog, narx bosqichlari, min/zaxira tekshiruvi | `server/orders.js#quote`, `public/shop.js` |
| FR-04…06 guruhlar, atomik limit, muddat | `server/orders.js#createOrder/evalGroup` (`BEGIN IMMEDIATE` + shartli UPDATE) |
| FR-07/08 checkout, order snapshot | `/api/checkout/quote`, `orders.items/address_snapshot` |
| FR-09 buyurtmalar | `/profile/orders` |
| FR-10 sotuvchi paneli | `/seller` (mahsulot, narx bosqichi, zaxira, guruh, buyurtma holati) |
| FR-11 admin | `/admin` (buyurtma, yetkazish, guruh, refund, moderatsiya, zona/sozlama, audit, KPI) |
| FR-12 to‘lov | `server/payments.js` — `paid` faqat imzolangan webhook orqali |
| FR-13 tejash | faqat admin tasdiqlagan bozor narxi bo‘lsa ko‘rsatiladi |
| FR-14 havola | guruh sahifasida “ulashish” |
| Guruh xonasi | `/room/KOD` — har guruhning qisqa kodi (6 belgi) va o‘z sahifasi: kod/havola bilan kirish, miqdor tanlash va buyurtma shu yerda. `GET /api/rooms/:code` |
| FR-15 manzillarni birlashtirish (P2) | qilinmagan |

## Qabul qilingan qarorlar (PRD §15 ochiq savollari bo‘yicha — o‘zgartirish mumkin)
- **Pilot:** Toshkent, 4 ta zona (har biri qat’iy narx; admin tahrirlaydi).
- **Guruh to‘lovi:** qo‘shilganda joy/zaxira **band qilinadi** (15 daqiqa), to‘lov shu muddatda; faqat band/to‘langan miqdor limitga qo‘shiladi. Limit to‘lib, hamma to‘lagach guruh `successful`. Limit to‘lgan, lekin to‘lanmagan joylar bo‘shasa — guruh yana `open`.
- **Yakuniy narx:** guruh yopilgandagi umumiy miqdor bo‘yicha; ishtirokchi qo‘shilganda to‘lagan narx yuqori bo‘lsa, farq `refund_pending` sifatida yoziladi.
- **Muddati o‘tgan guruh:** `failed`, to‘langanlar uchun `refund_pending`, band joylar bo‘shatiladi.
- **To‘lov provayderi:** tanlanmagan, shuning uchun `mock` sandbox (`/mock-pay/:ref`) — u ham haqiqiy provayderdek imzolangan webhook yuboradi. Real provayder `payments.js#providers` ga qo‘shiladi. Refund hozir qo‘lda (admin “Refund boshlash” → “Bajarildi”).
- **Komissiya (5%), to‘lov komissiyasi (1.5%), yetkazish oralig‘i (120 daqiqa):** admin sozlamalarida; contribution KPI shularga tayanadi — real shartlar kelishilgach yangilang.
- Sotuvchi xaridorning telefon/manzilini ko‘rmaydi (faqat ism va hudud).

## Xavfsizlik
scrypt parol xeshi, HttpOnly+SameSite sessiya cookie, rol/egalik tekshiruvi har endpointda, kiritishni validatsiya, rate limit, CSP va xavfsiz sarlavhalar, mutatsiyalar faqat JSON, pul — butun so‘m, vaqt — UTC, `Idempotency-Key` bilan takroriy so‘rovdan himoya, audit jurnali. Productionda `PAYMENT_WEBHOOK_SECRET` va HTTPS (`NODE_ENV=production`) majburiy.
