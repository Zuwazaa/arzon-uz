// Demo catalog as data. `server/catalog.js` turns each pack into database rows.
// Product fields: seller (1 or 2 = first/second seller), tiers as [minQty, unitPrice],
// retail = market price per unit (null = unknown), shop = where that price was checked.
// A product's first tier equals its minimum individual quantity.
// Photos are keys of WIKI in product-images.js.

// prettier-ignore
export const PACKS = [
  {
    name: 'Asosiy katalog', // created together with the demo accounts
    categories: [
      ['Don va un mahsulotlari', '🌾'],
      ['Yog‘ va ziravorlar', '🫒'],
      ['Shakar va choy', '🍵'],
      ['Uy-ro‘zg‘or', '🧼'],
      ['Konservalar', '🥫'],
      ['Quruq mevalar va yong‘oqlar', '🥜'],
    ],
    products: [
      // Don va un mahsulotlari
      {
        seller: 1, category: 'Don va un mahsulotlari', title: 'Guruch “Lazer” (devzira)', emoji: '🍚', image: 'rice',
        unit: 'kg', pack: 5, min: 25, stock: 2000, retail: 19000, shop: 'Chilonzor bozori',
        tiers: [[25, 16500], [100, 15500], [250, 14800]],
        desc: 'Birinchi navli devzira guruch, 5 kg qadoqlarda. Palov uchun ideal.',
      },
      {
        seller: 1, category: 'Don va un mahsulotlari', title: 'Un “Oliy nav”', emoji: '🥖', image: 'flour',
        unit: 'kg', pack: 10, min: 50, stock: 3000, retail: 7500, shop: 'Makro supermarket',
        tiers: [[50, 6400], [200, 6000], [500, 5700]],
        desc: '50 kg qoplarda emas, 10 kg qadoqlarda sotiladi.',
      },
      {
        seller: 1, category: 'Don va un mahsulotlari', title: 'Makaron (spagetti) 1 kg', emoji: '🍝', image: 'pasta',
        unit: 'dona', pack: 10, min: 20, stock: 1800, retail: 8500, shop: 'Korzinka',
        tiers: [[20, 7400], [100, 6900], [300, 6500]],
        desc: 'Qattiq bug‘doy navidan, 1 kg qadoqlarda.',
      },
      {
        seller: 1, category: 'Don va un mahsulotlari', title: 'Grechka (murch) yormasi 800 g', emoji: '🌾', image: 'buckwheat',
        unit: 'dona', pack: 10, min: 20, stock: 1500, retail: 9200, shop: 'Chilonzor bozori',
        tiers: [[20, 8100], [100, 7600], [250, 7200]],
        desc: 'Tozalangan grechka yormasi, 800 g qadoqlarda.',
      },
      {
        seller: 1, category: 'Don va un mahsulotlari', title: 'Manka yormasi 1 kg', emoji: '🌾', image: 'semolina',
        unit: 'dona', pack: 10, min: 20, stock: 1200, retail: null, shop: null,
        tiers: [[20, 6200], [100, 5800], [250, 5500]],
        desc: 'Bug‘doydan tayyorlangan manka yormasi, 1 kg qadoqlarda.',
      },
      // Yog‘ va ziravorlar
      {
        seller: 2, category: 'Yog‘ va ziravorlar', title: 'Kungaboqar yog‘i 5 l', emoji: '🫒', image: 'sunflowerOil',
        unit: 'dona', pack: 1, min: 6, stock: 600, retail: 78000, shop: 'Korzinka',
        tiers: [[6, 69000], [24, 66000], [60, 63500]],
        desc: 'Tozalangan, hidsiz kungaboqar yog‘i, 5 litrlik shisha.',
      },
      {
        seller: 2, category: 'Yog‘ va ziravorlar', title: 'Zaytun yog‘i (ekstra bakra) 1 l', emoji: '🫒', image: 'oliveOil',
        unit: 'dona', pack: 1, min: 6, stock: 300, retail: 98000, shop: 'Korzinka',
        tiers: [[6, 87000], [24, 82000], [60, 78000]],
        desc: 'Sovuq presslangan ekstra bakra zaytun yog‘i, 1 litrlik shisha.',
      },
      {
        seller: 2, category: 'Yog‘ va ziravorlar', title: 'Osh tuzi (yodlangan) 1 kg', emoji: '🧂', image: 'salt',
        unit: 'dona', pack: 20, min: 40, stock: 2500, retail: 2800, shop: 'Chilonzor bozori',
        tiers: [[40, 2300], [200, 2100], [500, 1950]],
        desc: 'Yodlangan osh tuzi, 1 kg qadoqlarda.',
      },
      {
        seller: 2, category: 'Yog‘ va ziravorlar', title: 'Qora murch (butun) 100 g', emoji: '🌶️', image: 'pepper',
        unit: 'dona', pack: 10, min: 20, stock: 900, retail: 14000, shop: 'Makro supermarket',
        tiers: [[20, 12200], [100, 11500], [250, 10800]],
        desc: 'Butun qora murch donalari, 100 g qadoqlarda.',
      },
      {
        seller: 2, category: 'Yog‘ va ziravorlar', title: 'Lavr bargi (dafna) 50 g', emoji: '🍃', image: 'bayLeaf',
        unit: 'dona', pack: 20, min: 40, stock: 700, retail: null, shop: null,
        tiers: [[40, 3100], [200, 2850], [500, 2600]],
        desc: 'Quritilgan dafna bargi, 50 g qadoqlarda.',
      },
      // Shakar va choy
      {
        seller: 2, category: 'Shakar va choy', title: 'Shakar (qand) 1 kg', emoji: '🍬', image: 'sugar',
        unit: 'kg', pack: 1, min: 20, stock: 4000, retail: null, shop: null,
        tiers: [[20, 12400], [100, 11800], [300, 11200]],
        desc: 'Oq kristall shakar.',
      },
      {
        seller: 2, category: 'Shakar va choy', title: 'Qora choy 400 g', emoji: '🍵', image: 'blackTea',
        unit: 'dona', pack: 10, min: 20, stock: 1600, retail: 24000, shop: 'Korzinka',
        tiers: [[20, 20500], [100, 19200], [250, 18000]],
        desc: 'Seylon qora choyi, 400 g qadoqlarda.',
      },
      {
        seller: 2, category: 'Shakar va choy', title: 'Yashil choy 400 g', emoji: '🍵', image: 'greenTea',
        unit: 'dona', pack: 10, min: 20, stock: 1400, retail: 25000, shop: 'Korzinka',
        tiers: [[20, 21500], [100, 20200], [250, 19000]],
        desc: 'Yirik bargli yashil choy, 400 g qadoqlarda.',
      },
      {
        seller: 2, category: 'Shakar va choy', title: 'Erituvchi kofe 200 g', emoji: '☕', image: 'coffee',
        unit: 'dona', pack: 5, min: 10, stock: 800, retail: 46000, shop: 'Makro supermarket',
        tiers: [[10, 40000], [50, 37500], [120, 35000]],
        desc: 'Granula shaklidagi erituvchi qora kofe, 200 g bankada.',
      },
      // Uy-ro‘zg‘or
      {
        seller: 2, category: 'Uy-ro‘zg‘or', title: 'Kir yuvish kukuni 3 kg', emoji: '🧼', image: 'washingPowder',
        unit: 'dona', pack: 1, min: 4, stock: 800, retail: 52000, shop: 'Chilonzor bozori',
        tiers: [[4, 44500], [20, 41500], [50, 39000]],
        desc: 'Avtomat mashinalar uchun.',
      },
      {
        seller: 2, category: 'Uy-ro‘zg‘or', title: 'Idish yuvish suyuqligi 500 ml', emoji: '🧴', image: 'dishSoap',
        unit: 'dona', pack: 6, min: 12, stock: 1200, retail: 13500, shop: 'Korzinka',
        tiers: [[12, 11800], [60, 11000], [150, 10300]],
        desc: 'Limon hidli idish yuvish suyuqligi, 500 ml flakonda.',
      },
      {
        seller: 2, category: 'Uy-ro‘zg‘or', title: 'Tualet qog‘ozi (12 dona)', emoji: '🧻', image: 'toiletPaper',
        unit: 'dona', pack: 4, min: 8, stock: 950, retail: 32000, shop: 'Makro supermarket',
        tiers: [[8, 27500], [40, 25500], [100, 24000]],
        desc: 'Yumshoq, 2 qatlamli tualet qog‘ozi, 12 rulonli o‘ramda.',
      },
      {
        seller: 2, category: 'Uy-ro‘zg‘or', title: 'Axlat paketlari (ro‘lik, 50 dona)', emoji: '🗑️', image: 'trashBags',
        unit: 'dona', pack: 10, min: 20, stock: 1100, retail: 18000, shop: 'Chilonzor bozori',
        tiers: [[20, 15500], [100, 14200], [250, 13200]],
        desc: '60 litrlik mustahkam axlat paketlari, 50 donali o‘ramda.',
      },
      // Konservalar
      {
        seller: 1, category: 'Konservalar', title: 'Pomidor konservasi 700 g', emoji: '🥫', image: 'cannedTomato',
        unit: 'dona', pack: 12, min: 24, stock: 1300, retail: 11500, shop: 'Korzinka',
        tiers: [[24, 9800], [120, 9100], [300, 8500]],
        desc: 'O‘z sharbatidagi pomidor konservasi, 700 g bankada.',
      },
      {
        seller: 1, category: 'Konservalar', title: 'Konservalangan no‘xat 400 g', emoji: '🥫', image: 'cannedPeas',
        unit: 'dona', pack: 12, min: 24, stock: 1100, retail: 9800, shop: 'Makro supermarket',
        tiers: [[24, 8400], [120, 7800], [300, 7300]],
        desc: 'Yosh no‘xat konservasi, 400 g bankada.',
      },
      {
        seller: 1, category: 'Konservalar', title: 'Konservalangan makkajo‘xori 340 g', emoji: '🌽', image: 'cannedCorn',
        unit: 'dona', pack: 12, min: 24, stock: 1050, retail: 9200, shop: 'Makro supermarket',
        tiers: [[24, 7900], [120, 7300], [300, 6900]],
        desc: 'Shirin makkajo‘xori doni konservasi, 340 g bankada.',
      },
      {
        seller: 1, category: 'Konservalar', title: 'Baliq konservasi (sardalya) 240 g', emoji: '🐟', image: 'sardines',
        unit: 'dona', pack: 10, min: 20, stock: 850, retail: 18500, shop: 'Chilonzor bozori',
        tiers: [[20, 15800], [100, 14600], [250, 13700]],
        desc: 'O‘simlik yog‘idagi sardalya konservasi, 240 g bankada.',
      },
      {
        seller: 1, category: 'Konservalar', title: 'Tuzlangan bodring 800 g', emoji: '🥒', image: 'pickles',
        unit: 'dona', pack: 10, min: 20, stock: 900, retail: null, shop: null,
        tiers: [[20, 13200], [100, 12300], [250, 11500]],
        desc: 'An’anaviy tuzlangan bodring, 800 g bankada.',
      },
      // Quruq mevalar va yong‘oqlar
      {
        seller: 2, category: 'Quruq mevalar va yong‘oqlar', title: 'Tabiiy asal 1 kg', emoji: '🍯', image: 'honey',
        unit: 'dona', pack: 5, min: 10, stock: 500, retail: 85000, shop: 'Korzinka',
        tiers: [[10, 74000], [50, 69000], [120, 65000]],
        desc: 'Tog‘ gullaridan yig‘ilgan tabiiy asal, 1 kg bankada.',
      },
      {
        seller: 2, category: 'Quruq mevalar va yong‘oqlar', title: 'Quritilgan o‘rik 500 g', emoji: '🍑', image: 'apricots',
        unit: 'dona', pack: 10, min: 20, stock: 700, retail: 34000, shop: 'Chilonzor bozori',
        tiers: [[20, 29000], [100, 27000], [250, 25500]],
        desc: 'Quyoshda quritilgan, yadrosiz o‘rik, 500 g qadoqlarda.',
      },
      {
        seller: 2, category: 'Quruq mevalar va yong‘oqlar', title: 'Yong‘oq mag‘zi 500 g', emoji: '🥜', image: 'walnuts',
        unit: 'dona', pack: 10, min: 20, stock: 600, retail: 58000, shop: 'Makro supermarket',
        tiers: [[20, 50000], [100, 46500], [250, 43500]],
        desc: 'Tozalangan yong‘oq mag‘zi, 500 g qadoqlarda.',
      },
      {
        seller: 2, category: 'Quruq mevalar va yong‘oqlar', title: 'Mayiz (qora) 500 g', emoji: '🍇', image: 'raisins',
        unit: 'dona', pack: 10, min: 20, stock: 800, retail: 21000, shop: 'Chilonzor bozori',
        tiers: [[20, 18000], [100, 16800], [250, 15800]],
        desc: 'Quritilgan qora mayiz, 500 g qadoqlarda.',
      },
      {
        seller: 2, category: 'Quruq mevalar va yong‘oqlar', title: 'No‘xat (quruq) 1 kg', emoji: '🫘', image: 'chickpeas',
        unit: 'dona', pack: 10, min: 20, stock: 900, retail: null, shop: null,
        tiers: [[20, 14500], [100, 13500], [250, 12700]],
        desc: 'Quruq no‘xat, 1 kg qadoqlarda.',
      },
    ],
    // [product title, target qty, min member qty, duration in hours]
    groups: [
      ['Guruch “Lazer” (devzira)', 250, 5, 48],
      ['Kungaboqar yog‘i 5 l', 60, 1, 30],
      ['Kir yuvish kukuni 3 kg', 50, 1, 40],
      ['Grechka (murch) yormasi 800 g', 100, 10, 36],
      ['Pomidor konservasi 700 g', 120, 12, 60],
    ],
  },
  {
    name: 'Bitiruv, kantstovar va to‘y bo‘limlari',
    categories: [
      ['So‘nggi qo‘ng‘iroq va bitiruv', '🎓'],
      ['Kantstovarlar', '✏️'],
      ['To‘y va tantana uchun', '🎉'],
    ],
    products: [
      // So‘nggi qo‘ng‘iroq va bitiruv
      {
        seller: 2, category: 'So‘nggi qo‘ng‘iroq va bitiruv', title: 'Bitiruvchi lentasi “11-sinf”', emoji: '🎗️', image: 'sablay',
        unit: 'dona', pack: 1, min: 10, stock: 800, retail: 25000, shop: 'Chilonzor bozori',
        tiers: [[10, 19500], [50, 17000], [150, 15000]],
        desc: 'Atlas bitiruvchi lentasi, 11-sinf so‘nggi qo‘ng‘iroqi uchun.',
      },
      {
        seller: 2, category: 'So‘nggi qo‘ng‘iroq va bitiruv', title: 'Bitiruvchi lentasi “9-sinf”', emoji: '🎗️', image: 'baldric',
        unit: 'dona', pack: 1, min: 10, stock: 800, retail: 22000, shop: 'Chilonzor bozori',
        tiers: [[10, 17000], [50, 15000], [150, 13000]],
        desc: 'Atlas bitiruvchi lentasi, 9-sinf bitiruvchilari uchun.',
      },
      {
        seller: 2, category: 'So‘nggi qo‘ng‘iroq va bitiruv', title: 'Bitiruvchi shapkasi (akademik)', emoji: '🎓', image: 'gradCap',
        unit: 'dona', pack: 1, min: 10, stock: 400, retail: 38000, shop: 'Makro supermarket',
        tiers: [[10, 30000], [50, 26500], [100, 24000]],
        desc: 'To‘rtburchak tepali bitiruvchi shapkasi, bir o‘lchamli.',
      },
      {
        seller: 2, category: 'So‘nggi qo‘ng‘iroq va bitiruv', title: 'Diplom va sertifikat papkasi', emoji: '📜', image: 'diploma',
        unit: 'dona', pack: 5, min: 20, stock: 1500, retail: 16000, shop: 'Chilonzor bozori',
        tiers: [[20, 11500], [100, 10000], [300, 9000]],
        desc: 'Bitiruv guvohnomalari va sertifikatlar uchun qattiq muqovali papka.',
      },
      // Kantstovarlar
      {
        seller: 1, category: 'Kantstovarlar', title: 'Daftar 48 varaq (katak)', emoji: '📓', image: 'notebooks',
        unit: 'dona', pack: 10, min: 50, stock: 8000, retail: 4500, shop: 'Chilonzor bozori',
        tiers: [[50, 3200], [300, 2900], [1000, 2600]],
        desc: 'Maktab uchun 48 varaqli katakli daftar, rangli muqovada.',
      },
      {
        seller: 1, category: 'Kantstovarlar', title: 'Sharikli ruchka (ko‘k), quti 50 dona', emoji: '🖊️', image: 'pens',
        unit: 'quti', pack: 1, min: 5, stock: 600, retail: 60000, shop: 'Makro supermarket',
        tiers: [[5, 42000], [20, 38000], [60, 34000]],
        desc: 'Ko‘k siyohli sharikli ruchkalar, bir qutida 50 dona.',
      },
      {
        seller: 1, category: 'Kantstovarlar', title: 'Rangli qalamlar 12 rang', emoji: '🖍️', image: 'pencils',
        unit: 'dona', pack: 6, min: 12, stock: 2500, retail: 18000, shop: 'Korzinka',
        tiers: [[12, 13500], [60, 12500], [200, 11500]],
        desc: 'Yog‘ochdan tayyorlangan 12 xil rangli qalamlar to‘plami.',
      },
      {
        seller: 1, category: 'Kantstovarlar', title: 'Flomasterlar 12 rang', emoji: '🖍️', image: 'markers',
        unit: 'dona', pack: 6, min: 12, stock: 2000, retail: 16000, shop: 'Korzinka',
        tiers: [[12, 11800], [60, 10800], [200, 9800]],
        desc: 'Yuviladigan siyohli 12 rangli flomasterlar to‘plami.',
      },
      {
        seller: 1, category: 'Kantstovarlar', title: 'Maktab ryukzagi', emoji: '🎒', image: 'backpack',
        unit: 'dona', pack: 1, min: 5, stock: 300, retail: 125000, shop: 'Makro supermarket',
        tiers: [[5, 95000], [20, 88000], [50, 82000]],
        desc: 'Keng, ortopedik orqa qismli maktab ryukzagi.',
      },
      // To‘y va tantana uchun
      {
        seller: 2, category: 'To‘y va tantana uchun', title: 'Bir martalik stakanlar (50 dona)', emoji: '🥤', image: 'cups',
        unit: 'dona', pack: 10, min: 20, stock: 3000, retail: 9000, shop: 'Chilonzor bozori',
        tiers: [[20, 6700], [100, 6100], [300, 5600]],
        desc: 'Bir martalik stakanlar, bir o‘ramda 50 dona.',
      },
      {
        seller: 2, category: 'To‘y va tantana uchun', title: 'Salfetkalar (100 dona)', emoji: '🧻', image: 'napkins',
        unit: 'dona', pack: 10, min: 20, stock: 4000, retail: 6500, shop: 'Chilonzor bozori',
        tiers: [[20, 4600], [100, 4100], [300, 3700]],
        desc: 'Dasturxon uchun qog‘oz salfetkalar, o‘ramda 100 dona.',
      },
      {
        seller: 2, category: 'To‘y va tantana uchun', title: 'To‘y shamlari (10 dona)', emoji: '🕯️', image: 'candles',
        unit: 'dona', pack: 5, min: 10, stock: 900, retail: 22000, shop: 'Chilonzor bozori',
        tiers: [[10, 16500], [50, 14800], [150, 13200]],
        desc: 'Dasturxon va tantana bezagi uchun oq shamlar, 10 dona.',
      },
      {
        seller: 2, category: 'To‘y va tantana uchun', title: 'Bengal o‘tlari (10 dona)', emoji: '✨', image: 'sparklers',
        unit: 'dona', pack: 10, min: 20, stock: 1500, retail: 14000, shop: 'Chilonzor bozori',
        tiers: [[20, 9800], [100, 8800], [300, 7900]],
        desc: 'Tantana uchun bengal o‘tlari. Faqat ochiq havoda va kattalar nazoratida ishlating.',
      },
      {
        seller: 2, category: 'To‘y va tantana uchun', title: 'Konfeti pushkasi (5 dona)', emoji: '🎊', image: 'confetti',
        unit: 'dona', pack: 5, min: 10, stock: 700, retail: 30000, shop: 'Chilonzor bozori',
        tiers: [[10, 22500], [50, 20000], [150, 18000]],
        desc: 'Rangli konfeti otadigan pushka, to‘y va bitiruv bayrami uchun.',
      },
    ],
    // [product title, target qty, min member qty, duration in hours]
    groups: [
      ['Bitiruvchi lentasi “11-sinf”', 150, 10, 72],
      ['Maktab ryukzagi', 40, 5, 60],
    ],
  },
  {
    name: 'Shirinliklar va pishiriqlar',
    categories: [
      ['Shirinliklar', '🍬'],
      ['Pishiriqlar', '🥐'],
    ],
    products: [
      // Shirinliklar
      {
        seller: 2, category: 'Shirinliklar', title: 'Konfet assorti 1 kg', emoji: '🍬', image: 'candies',
        unit: 'dona', pack: 5, min: 10, stock: 1200, retail: 38000, shop: 'Chilonzor bozori',
        tiers: [[10, 29000], [50, 26500], [150, 24000]],
        desc: 'Turli xil mazali konfetlar aralashmasi, 1 kg qadoqda.',
      },
      {
        seller: 2, category: 'Shirinliklar', title: 'Shokolad plitkasi 90 g, quti 20 dona', emoji: '🍫', image: 'chocolate',
        unit: 'quti', pack: 1, min: 2, stock: 300, retail: 150000, shop: 'Makro supermarket',
        tiers: [[2, 112000], [10, 104000], [30, 96000]],
        desc: 'Sut shokoladi plitkalari, bir qutida 20 dona.',
      },
      {
        seller: 2, category: 'Shirinliklar', title: 'Pechenye “Assorti” 1 kg', emoji: '🍪', image: 'biscuits',
        unit: 'dona', pack: 5, min: 10, stock: 1500, retail: 32000, shop: 'Korzinka',
        tiers: [[10, 24500], [50, 22500], [150, 20500]],
        desc: 'Qummoq va shirin pechenyelar aralashmasi, 1 kg qadoqda.',
      },
      {
        seller: 2, category: 'Shirinliklar', title: 'Vafli vanilli 200 g', emoji: '🧇', image: 'wafers',
        unit: 'dona', pack: 10, min: 20, stock: 3000, retail: 9000, shop: 'Korzinka',
        tiers: [[20, 6800], [100, 6200], [300, 5700]],
        desc: 'Vanil ta’mli qatlamli vafli, 200 g.',
      },
      {
        seller: 2, category: 'Shirinliklar', title: 'Xalva 500 g', emoji: '🥜', image: 'halva',
        unit: 'dona', pack: 5, min: 10, stock: 900, retail: 28000, shop: 'Chilonzor bozori',
        tiers: [[10, 21500], [50, 19500], [150, 18000]],
        desc: 'An’anaviy xalva, 500 g qadoqda.',
      },
      {
        seller: 2, category: 'Shirinliklar', title: 'Zefir 300 g', emoji: '🍥', image: 'marshmallow',
        unit: 'dona', pack: 10, min: 20, stock: 2000, retail: 14000, shop: 'Makro supermarket',
        tiers: [[20, 10500], [100, 9600], [300, 8800]],
        desc: 'Yumshoq zefir, 300 g qadoqda.',
      },
      {
        seller: 2, category: 'Shirinliklar', title: 'Nabot (kristall shakar) 500 g', emoji: '💎', image: 'rockCandy',
        unit: 'dona', pack: 10, min: 20, stock: 2000, retail: 20000, shop: 'Chilonzor bozori',
        tiers: [[20, 15200], [100, 14000], [300, 12800]],
        desc: 'Choy bilan ichiladigan nabot, 500 g qadoqda.',
      },
      {
        seller: 2, category: 'Shirinliklar', title: 'Pahlava 1 kg', emoji: '🍯', image: 'baklava',
        unit: 'dona', pack: 1, min: 5, stock: 400, retail: 90000, shop: 'Chilonzor bozori',
        tiers: [[5, 69000], [20, 64000], [60, 60000]],
        desc: 'Yong‘oqli va asalli pahlava, 1 kg.',
      },
      // Pishiriqlar
      {
        seller: 1, category: 'Pishiriqlar', title: 'Tandir non (patir)', emoji: '🫓', image: 'tandirNon',
        unit: 'dona', pack: 10, min: 30, stock: 3000, retail: 7000, shop: 'Chorsu bozori',
        tiers: [[30, 5200], [150, 4800], [500, 4400]],
        desc: 'Tandirda pishirilgan yangi patir non, dona narxida.',
      },
      {
        seller: 1, category: 'Pishiriqlar', title: 'Lavash (yupqa non), 5 dona', emoji: '🫓', image: 'lavash',
        unit: 'dona', pack: 10, min: 20, stock: 2500, retail: 9000, shop: 'Korzinka',
        tiers: [[20, 6600], [100, 6000], [300, 5500]],
        desc: 'Yupqa lavash non, bir o‘ramda 5 dona.',
      },
      {
        seller: 1, category: 'Pishiriqlar', title: 'Kruassan (qaymoqli)', emoji: '🥐', image: 'croissant',
        unit: 'dona', pack: 10, min: 30, stock: 1500, retail: 8000, shop: 'Makro supermarket',
        tiers: [[30, 5800], [150, 5300], [400, 4800]],
        desc: 'Qaymoqli to‘ldirmali yangi kruassan, dona narxida.',
      },
      {
        seller: 1, category: 'Pishiriqlar', title: 'Shokoladli tort 1 kg', emoji: '🎂', image: 'cake',
        unit: 'dona', pack: 1, min: 3, stock: 120, retail: 140000, shop: 'Chilonzor bozori',
        tiers: [[3, 110000], [10, 102000], [30, 95000]],
        desc: 'Shokoladli qatlamli tort, 1 kg. Buyurtmaga qarab tayyorlanadi.',
      },
      {
        seller: 1, category: 'Pishiriqlar', title: 'Keks (maffin)', emoji: '🧁', image: 'muffins',
        unit: 'dona', pack: 10, min: 30, stock: 2000, retail: 6000, shop: 'Korzinka',
        tiers: [[30, 4300], [150, 3900], [400, 3500]],
        desc: 'Mayda keks (maffin), dona narxida.',
      },
      {
        seller: 1, category: 'Pishiriqlar', title: 'Asalli pryanik 500 g', emoji: '🍘', image: 'gingerbread',
        unit: 'dona', pack: 5, min: 10, stock: 800, retail: 22000, shop: 'Chilonzor bozori',
        tiers: [[10, 16500], [50, 15000], [150, 13800]],
        desc: 'Asalli pryanik, 500 g qadoqda.',
      },
    ],
    // [product title, target qty, min member qty, duration in hours]
    groups: [
      ['Konfet assorti 1 kg', 200, 10, 48],
      ['Pechenye “Assorti” 1 kg', 150, 10, 72],
    ],
  },
  {
    name: 'Ichimliklar',
    categories: [
      ['Ichimliklar', '🥤'],
    ],
    products: [
      // Ichimliklar
      {
        seller: 2, category: 'Ichimliklar', title: 'Mineral suv 1,5 l, quti 6 dona', emoji: '💧', image: 'mineralWater',
        unit: 'quti', pack: 1, min: 5, stock: 900, retail: 24000, shop: 'Korzinka',
        tiers: [[5, 17500], [20, 16000], [60, 14800]],
        desc: 'Gazsiz mineral suv, 1,5 litrlik shisha, bir qutida 6 dona.',
      },
      {
        seller: 2, category: 'Ichimliklar', title: 'Olma sharbati 1 l, quti 12 dona', emoji: '🧃', image: 'appleJuice',
        unit: 'quti', pack: 1, min: 3, stock: 300, retail: 110000, shop: 'Makro supermarket',
        tiers: [[3, 84000], [10, 78000], [30, 73000]],
        desc: 'Tabiiy olma sharbati, 1 litrlik paket, bir qutida 12 dona.',
      },
      {
        seller: 2, category: 'Ichimliklar', title: 'Apelsin sharbati 1 l, quti 12 dona', emoji: '🍊', image: 'orangeJuice',
        unit: 'quti', pack: 1, min: 3, stock: 300, retail: 125000, shop: 'Makro supermarket',
        tiers: [[3, 96000], [10, 89000], [30, 83000]],
        desc: 'Apelsin sharbati, 1 litrlik paket, bir qutida 12 dona.',
      },
      {
        seller: 2, category: 'Ichimliklar', title: 'Limonad 1,5 l, quti 6 dona', emoji: '🥤', image: 'lemonade',
        unit: 'quti', pack: 1, min: 5, stock: 600, retail: 52000, shop: 'Korzinka',
        tiers: [[5, 38500], [20, 35500], [60, 33000]],
        desc: 'Gazlangan limonad, 1,5 litrlik shisha, bir qutida 6 dona.',
      },
    ],
    // [product title, target qty, min member qty, duration in hours]
    groups: [
      ['Mineral suv 1,5 l, quti 6 dona', 100, 5, 72],
    ],
  },
];
