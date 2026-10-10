import {
  html,
  raw,
  t,
  money,
  num,
  dt,
  pct,
  badge,
  GROUP_STATUS,
  SLOT,
  api,
  route,
  state,
  navigate,
  toast,
  guarded,
  tick,
  formData,
  copyText,
} from './core.js';

// ------------------------------------------------------------------ shared components
const p2n = (n) => String(n).padStart(2, '0');
const clock = (iso) => {
  const ms = new Date(iso) - Date.now();
  if (ms <= 0) return t('Tugadi');
  const d = Math.floor(ms / 864e5),
    h = Math.floor((ms % 864e5) / 36e5),
    m = Math.floor((ms % 36e5) / 6e4),
    s = Math.floor((ms % 6e4) / 1e3);
  return `${d ? d + ' ' + t('kun') + ' ' : ''}${p2n(h)}:${p2n(m)}:${p2n(s)}`;
};
const stage = (cur, target) => {
  const p = (cur / target) * 100;
  return p < 34 ? 'low' : p < 80 ? 'mid' : 'high';
};
export const progress = (cur, target) =>
  html`<div class="bar st-${stage(cur, target)}" role="progressbar" aria-valuenow="${cur}" aria-valuemax="${target}"><i style="width:${Math.min(100, (cur / target) * 100)}%"></i></div>`;
const groupStats = (g) => ({
  pct: Math.min(100, Math.round((g.committedQty / g.targetQty) * 100)),
  left: Math.max(0, g.targetQty - g.committedQty),
});
const needLeft = (g, unit) => {
  const { pct, left } = groupStats(g);
  const hot = pct >= 80 && left > 0;
  return html`<div class="need-left ${hot ? 'hot' : ''}">${left > 0 ? html`${hot ? html`${t('Deyarli to‘ldi!')} ` : ''}${t('Yana')} <b>${num(left)} ${unit}</b> ${t('kerak')}` : t('Limit to‘ldi')}</div>`;
};
export const catClass = (id) => 'c' + ((Number(id) || 0) % 8);
export const thumbMedia = (p) =>
  p.imageUrl
    ? html`<img src="${p.imageUrl}" alt="${p.title}" loading="lazy">`
    : html`<span class="ico">${p.emoji}</span>`;

const saving = (retail, price) =>
  retail && retail.price > price
    ? { amt: retail.price - price, pct: Math.round((1 - price / retail.price) * 100) }
    : null;

const saveOverlay = (p) => {
  const base = p.retail ? p.retail.price : p.tiers[0].unitPrice;
  const rows = p.tiers.map((x) => ({ x, amt: (base - x.unitPrice) * x.minQty })).filter((r) => r.amt > 0);
  if (!rows.length) return '';
  return html`<div class="saveov" aria-hidden="true"><div class="saveov-h">${p.retail ? t('Bozor narxiga nisbatan tejash') : t('Ko‘p olsangiz tejaysiz')}</div>
    ${rows.map(({ x, amt }) => html`<div class="srow2"><span>${num(x.minQty)}+ ${p.unit}</span><b>−<span data-amt="${amt}">${num(amt)}</span> ${t('so‘m')}</b></div>`)}</div>`;
};

export const productCard = (p) => {
  const s = saving(p.retail, p.entryPrice);
  return html`
  <a class="card product" href="/products/${p.slug}" data-link>
    <div class="thumb">${s ? html`<span class="off-tag">−${s.pct}%</span>` : ''}${p.openGroupId ? html`<span class="tag">${t('Guruh bor')}</span>` : ''}${thumbMedia(p)}${saveOverlay(p)}</div>
    <h3>${p.title}</h3>
    <div class="price">${money(p.entryPrice)}<small> / 1 ${p.unit}</small></div>
    <span class="go">${t('Ko‘rish va tanlash')}</span>
  </a>`;
};

export const groupCard = (g) => {
  const { pct } = groupStats(g);
  return html`
  <a class="card group" href="/groups/${g.id}" data-link>
    <div class="row"><div class="thumb sm ${catClass(g.product.categoryId)}">${thumbMedia(g.product)}</div><h3>${g.product.title}</h3>${g.status === 'open' ? '' : badge(GROUP_STATUS, g.status)}</div>
    ${progress(g.committedQty, g.targetQty)}
    <div class="row between small"><span><b class="pct">${pct}%</b> ${t('yig‘ildi')}</span><span>${num(g.members)} ${t('ishtirokchi')}</span></div>
    ${needLeft(g, g.product.unit)}
    <div class="price">${money(g.currentUnitPrice)}<small> / 1 ${g.product.unit}</small></div>
    <div class="clock" data-countdown="${g.endsAt}" data-label="${t('Tugashiga')}: ">${t('Tugashiga')}: ${clock(g.endsAt)}</div>
    <span class="go">${t('Guruhga qo‘shilish')}</span>
  </a>`;
};

export const tierTable = (tiers, unit, activeQty, retail) => {
  let active = tiers[0];
  for (const x of tiers) if (activeQty >= x.minQty) active = x;
  const has = tiers.some((x) => saving(retail, x.unitPrice));
  return html`<table class="tiers"><thead><tr><th>${t('Miqdor')}</th><th>${t('Birlik narxi')}</th>${has ? html`<th>${t('Bozor narxidan tejash')}</th>` : ''}</tr></thead><tbody>
    ${tiers.map((x) => {
      const s = saving(retail, x.unitPrice);
      return html`<tr class="${x === active ? 'on' : ''}"><td>${num(x.minQty)}+ ${unit}</td><td>${money(x.unitPrice)}</td>${has ? html`<td class="sv">${s ? html`−${s.pct}% · ${money(s.amt)}` : '—'}</td>` : ''}</tr>`;
    })}</tbody></table>`;
};
const savingsBox = (p) =>
  p.retail
    ? html`<div class="card save-box"><b>${t('Bozor narxiga nisbatan tejash')}</b>
  <p class="small">${t('Bozor narxi')} — ${t('bu mahsulotning do‘kon/bozordagi odatiy narxi')}: <b>${money(p.retail.price)}</b> / ${p.unit}. ${t('Ulgurji yoki guruh bo‘lib olsangiz, har bir birlik shu narxdan arzon bo‘ladi; miqdor qancha ko‘p bo‘lsa, tejash shuncha katta.')}</p>
  <p class="small muted">${t('Manba')}: ${p.retail.source}</p></div>`
    : '';
const savingRows = (retail, unitPrice, q, unit) => {
  const s = saving(retail, unitPrice);
  return s
    ? html`
  <div class="row between muted"><span>${t('Bozor narxida bo‘lardi')}</span><s>${money(retail.price * q)}</s></div>
  <div class="row between save-line"><span>${t('Sizning tejashingiz')} (${num(q)} ${unit})</span><b>${money(s.amt * q)} (−${s.pct}%)</b></div>`
    : '';
};
const tierPrice = (tiers, qty) => {
  let p = tiers[0];
  for (const x of tiers) if (qty >= x.minQty) p = x;
  return p;
};

function liveCountdowns(root) {
  return tick(() =>
    root.querySelectorAll('[data-countdown]').forEach((el) => {
      el.textContent = (el.dataset.label ?? 'Qoldi: ') + clock(el.dataset.countdown);
      el.classList.toggle('urgent', new Date(el.dataset.countdown) - Date.now() < 6 * 3600e3);
    }),
  );
}
function stepper(root, input, step, min, max, cb) {
  const set = (v) => {
    v = Math.max(min, Math.min(max, Math.round(v / step) * step));
    input.value = v;
    cb(v);
  };
  root.querySelector('[data-dec]').onclick = () => set(Number(input.value) - step);
  root.querySelector('[data-inc]').onclick = () => set(Number(input.value) + step);
  input.onchange = () => set(Number(input.value) || min);
  return set;
}

// ------------------------------------------------------------------ home
route('/', async () => {
  const [cats, groups, p1] = await Promise.all([
    api('GET', '/categories'),
    api('GET', '/groups'),
    api('GET', '/products?sort=saving&per=100'),
  ]);
  const all = p1.items;
  const deals = all.filter((p) => saving(p.retail, p.bestPrice));
  const top = deals
    .slice()
    .sort((a, b) => saving(b.retail, b.bestPrice).pct - saving(a.retail, a.bestPrice).pct)[0];
  const seen = new Set();
  const frames = all
    .filter((p) => p.imageUrl && !seen.has(p.categoryId) && seen.add(p.categoryId))
    .slice(0, 3);
  const catImg = (c) => all.find((p) => p.categoryId === c.id && p.imageUrl);
  const names = cats.map((c) => c.name);
  const tickerItems = [...names, ...names].map((n) => html`<span>${n}</span>`);
  return {
    html: html`
    <section class="hero2"><div>
      <span class="kicker">${t('Toshkent · ulgurji va guruhli xarid')}</span>
      <h1>${t('Bozordan')} <mark>${t('arzon')}</mark>,<br>${t('omborxona narxida')}</h1>
      <p>${t('Guruch, un, yog‘, choy va boshqa kundalik mahsulotlarni ulgurji narxda oling. Boshqalar bilan guruh bo‘lib xarid qilsangiz, narx yana tushadi.')}</p>
      <div class="row wrap"><a class="btn sun big" href="/products" data-link>${t('Katalogga o‘tish')} →</a><a class="btn big" href="/groups" data-link>${t('Guruhga qo‘shilish')}</a></div>
      <ul class="proof"><li>${t('Miqdor oshsa, narx tushadi')}</li><li>${t('Bozor narxi bilan solishtirish')}</li><li>${t('Yetkazish narxi oldindan ko‘rinadi')}</li></ul></div>
      <div class="collage">${frames.map((p, i) => html`<div class="frame f${i + 1}"><img src="${p.imageUrl}" alt="${p.title}"></div>`)}
        ${
          top
            ? html`<div class="sticker"><div><b>−<span data-count="${saving(top.retail, top.bestPrice).pct}" style="display:inline;font-size:inherit;margin:0;text-transform:none;letter-spacing:inherit">${saving(top.retail, top.bestPrice).pct}</span>%</b><span>${t('gacha arzon')}</span></div></div>
        <div class="deal">${top.title}<b>${money(top.bestPrice)}<small> / ${top.unit}</small></b><s>${t('Bozor narxi')}: ${money(top.retail.price)}</s></div>`
            : ''
        }</div></section>
    <div class="ticker bleed" aria-hidden="true"><div>${tickerItems}</div></div>
    <div class="cats">${cats.map((c) => {
      const p = catImg(c);
      return html`<a class="cat" href="/products?category=${c.id}" data-link>${p ? html`<img src="${p.imageUrl}" alt="" loading="lazy">` : ''}<span>${c.name}</span></a>`;
    })}</div>
    <div class="section-head"><div><h2>${t('Eng katta chegirmalar')}</h2><p>${t('Bozor narxidan eng arzon mahsulotlar')}</p></div><a href="/products?sort=saving" data-link>${t('Hammasi')} →</a></div>
    <div class="grid">${p1.items.slice(0, 10).map(productCard)}</div>
    ${
      groups.length
        ? html`<section class="band bleed"><div class="section-head"><div><h2>${t('Birgalikda olamiz, arzonroq olamiz')}</h2><p>${t('Limit to‘lguncha qo‘shiling. Yakuniy narx hamma uchun bir xil.')}</p></div><a href="/groups" data-link>${t('Barcha guruhlar')} →</a></div>
      <div class="grid">${groups.slice(0, 6).map(groupCard)}</div></section>`
        : ''
    }
    <section class="cta bleed"><h2>${t('Birinchi buyurtmangizni bering')}</h2><p>${t('Katalogdan tanlang yoki ochiq guruhga qo‘shilib, narxni birgalikda tushiring.')}</p>
      <a class="btn big" href="/products" data-link>${t('Katalogga o‘tish')} →</a></section>`,
    mount: (el) => liveCountdowns(el),
  };
});

// ------------------------------------------------------------------ catalog
route('/products', async ({ query }) => {
  const qs = new URLSearchParams(query);
  const [cats, res] = await Promise.all([api('GET', '/categories'), api('GET', '/products?' + qs)]);
  const cur = (k) => qs.get(k) || '';
  return {
    html: html`<h1>${t('Katalog')}</h1>
    <form class="filters" id="filters">
      <input type="search" name="q" value="${cur('q')}" placeholder="${t('Mahsulot nomi…')}" aria-label="${t('Qidiruv')}">
      <select name="category" aria-label="${t('Kategoriya')}"><option value="">${t('Barcha kategoriyalar')}</option>${cats.map((c) => html`<option value="${c.id}" ${String(c.id) === cur('category') ? raw('selected') : ''}>${c.name}</option>`)}</select>
      <select name="sort" aria-label="${t('Saralash')}">${[...(cur('q') ? [['relevance', 'Mosligi bo‘yicha']] : []), ['new', 'Yangilari'], ['price_asc', 'Arzonroq'], ['price_desc', 'Qimmatroq'], ['saving', 'Ko‘proq tejash']].map(([v, l]) => html`<option value="${v}" ${v === (cur('sort') || (cur('q') ? 'relevance' : 'new')) ? raw('selected') : ''}>${t(l)}</option>`)}</select>
      <label class="check"><input type="checkbox" name="group" value="1" ${cur('group') ? raw('checked') : ''}> ${t('Faol guruhi bor')}</label>
      <label class="check"><input type="checkbox" name="inStock" value="1" ${cur('inStock') ? raw('checked') : ''}> ${t('Zaxirada bor')}</label>
    </form>
    ${cur('q') && res.didYouMean ? html`<p class="dym">${t('Aslida')} <a href="/products?q=${encodeURIComponent(res.didYouMean)}" data-link><b>${res.didYouMean}</b></a> ${t('qidirdingizmi?')} ${t('Shunga yaqin natijalar ko‘rsatilmoqda.')}</p>` : ''}
    <p class="rescount">${cur('q') ? html`«<b>${cur('q')}</b>» ${t('bo‘yicha')} ` : ''}<b>${num(res.total)}</b> ${t('ta mahsulot')}</p>
    ${res.items.length ? html`<div class="grid">${res.items.map(productCard)}</div>` : html`<div class="nores"><h2>${cur('q') ? html`«${cur('q')}» ${t('topilmadi')}` : t('Hech narsa topilmadi.')}</h2><p class="muted">${t('Imloni tekshiring yoki bo‘limni tanlang:')}</p><div class="chips">${cats.map((c) => html`<a class="chip" href="/products?category=${c.id}" data-link>${c.name}</a>`)}</div></div>`}`,
    mount: (el) => {
      const f = el.querySelector('#filters');
      const go = () => {
        const p = new URLSearchParams();
        for (const [k, v] of new FormData(f)) if (v) p.set(k, v);
        navigate('/products?' + p, true);
      };
      f.onsubmit = (e) => {
        e.preventDefault();
        go();
      };
      f.querySelectorAll('select,input[type=checkbox]').forEach((x) => (x.onchange = go));
      let timer;
      f.q.oninput = () => {
        clearTimeout(timer);
        timer = setTimeout(go, 500);
      };
    },
  };
});

// ------------------------------------------------------------------ product detail
route('/products/:slug', async ({ params }) => {
  const p = await api('GET', '/products/' + encodeURIComponent(params[0]));
  const buyable = p.stockQty >= p.minIndividualQty;
  return {
    html: html`
    <nav class="crumbs"><a href="/products" data-link>${t('Katalog')}</a> / <a href="/products?category=${p.categoryId}" data-link>${p.categoryName}</a></nav>
    <div class="detail">
      <div class="thumb xl ${catClass(p.categoryId)}">${thumbMedia(p)}</div>
      <div>
        <h1>${p.title}</h1>
        <p class="muted">${t('Sotuvchi')}: <b>${p.sellerName}</b> · ${t('Zaxira')}: ${num(p.stockQty)} ${p.unit} · ${t('Qadoq')}: ${num(p.packSize)} ${p.unit}</p>
        <p>${p.description}</p>
        <h3>${t('Narx bosqichlari')}</h3><div id="tiers">${tierTable(p.tiers, p.unit, p.minIndividualQty, p.retail)}</div>
        ${savingsBox(p)}
        <div class="buybox card">
          <h3>${t('Individual ulgurji xarid')}</h3>
          <p class="small muted">${t('Minimal buyurtma')}: <b>${num(p.minIndividualQty)} ${p.unit}</b></p>
          ${
            buyable
              ? html`<div class="qty"><button type="button" class="btn" data-dec aria-label="−">−</button><input id="qty" type="number" inputmode="numeric" min="${p.minIndividualQty}" max="${p.stockQty}" step="${p.packSize}" value="${p.minIndividualQty}" aria-label="${t('Miqdor')}"><button type="button" class="btn" data-inc aria-label="+">+</button><span>${p.unit}</span></div>
          <div class="sum" id="sum"></div>
          <button class="btn primary block" id="buy">${t('Sotib olish')}</button>`
              : html`<p class="warn-text">${t('Hozirda zaxira yetarli emas.')}</p>`
          }
        </div>
        ${p.groups.length ? html`<h3>${t('Faol guruhlar')}</h3><div class="grid one">${p.groups.map(groupCard)}</div>` : ''}
      </div>
    </div>`,
    mount: (el) => {
      if (buyable) {
        const input = el.querySelector('#qty');
        const upd = (q) => {
          const tp = tierPrice(p.tiers, q);
          el.querySelector('#sum').innerHTML =
            String(html`<div class="row between"><span>${t('Birlik narxi')}</span><b>${money(tp.unitPrice)}</b></div>
            <div class="row between"><span>${t('Mahsulotlar')}</span><b>${money(tp.unitPrice * q)}</b></div>
            <div class="muted small">${t('Yetkazib berish narxi manzil tanlanganda checkoutda ko‘rsatiladi.')}</div>
            ${savingRows(p.retail, tp.unitPrice, q, p.unit)}`);
          el.querySelector('#tiers').innerHTML = String(tierTable(p.tiers, p.unit, q, p.retail));
        };
        stepper(el, input, p.packSize, p.minIndividualQty, p.stockQty, upd)(p.minIndividualQty);
        el.querySelector('#buy').onclick = () => navigate(`/checkout?product=${p.id}&qty=${input.value}`);
      }
      return liveCountdowns(el);
    },
  };
});

// ------------------------------------------------------------------ groups
route('/groups', async () => {
  const groups = await api('GET', '/groups');
  return {
    html: html`<h1>${t('Faol guruhlar')}</h1><p class="muted">${t('Guruh limiti to‘lganda barcha ishtirokchilar yakuniy chegirmali narxdan foydalanadi.')}</p>
    ${groups.length ? html`<div class="grid">${groups.map(groupCard)}</div>` : html`<div class="empty"><p>${t('Hozircha faol guruhlar yo‘q.')}</p></div>`}`,
    mount: liveCountdowns,
  };
});

route('/groups/:id', async ({ params }) => {
  const g = await api('GET', '/groups/' + params[0]);
  const p = g.product;
  const url = `${location.origin}/groups/${g.id}`;
  const min = Math.max(g.minMemberQty, p.packSize);
  const can = g.joinable && !g.mine && g.remainingQty >= min && p.stockQty >= min;
  return {
    html: html`
    <nav class="crumbs"><a href="/groups" data-link>${t('Guruhlar')}</a> / ${p.title}</nav>
    <div class="detail">
      <div class="thumb xl ${catClass(p.categoryId)}">${thumbMedia(p)}</div>
      <div>
        <div class="row between"><h1>${p.title}</h1>${badge(GROUP_STATUS, g.status)}</div>
        <p class="muted">${t('Sotuvchi')}: <b>${p.sellerName}</b> · ${num(g.members)} ${t('ishtirokchi')}</p>
        <div class="card">
          <div class="gclock"><span class="muted small">${t('Guruh tugashiga')}</span><div class="bigclock" data-countdown="${g.endsAt}" data-label="">${clock(g.endsAt)}</div></div>
          ${progress(g.committedQty, g.targetQty)}
          <div class="row between"><span><b class="pct">${groupStats(g).pct}%</b> ${t('yig‘ildi')} · ${num(g.committedQty)} / ${num(g.targetQty)} ${p.unit}</span><span>${num(g.members)} ${t('ishtirokchi')}</span></div>
          ${needLeft(g, p.unit)}
          <p class="small muted">${t('Faqat band qilingan/to‘langan miqdorlar hisobga olinadi.')} ${g.status === 'open' ? html`${t('Qolgan joy')}: <b>${num(g.remainingQty)} ${p.unit}</b>.` : ''}</p>
          <div class="row between"><span>${t('Joriy narx')}</span><b class="price">${money(g.currentUnitPrice)} / ${p.unit}</b></div>
          ${g.nextTier ? html`<p class="small ok">${t('Yana')} <b>${num(g.nextTier.needed)} ${p.unit}</b> ${t('yig‘ilsa narx')} <b>${money(g.nextTier.unitPrice)}</b> ${t('bo‘ladi')}.</p>` : ''}
        </div>
        <h3>${t('Narx bosqichlari (guruhning umumiy miqdori bo‘yicha)')}</h3>${tierTable(p.tiers, p.unit, g.committedQty, p.retail)}${savingsBox(p)}
        <p class="small muted">${t('Yakuniy narx guruh muvaffaqiyatli yopilgandagi umumiy miqdorga qarab aniqlanadi. Siz to‘lagan narx yakuniy narxdan yuqori bo‘lsa, farq qaytariladi. Muddat tugaguncha limit to‘lmasa, guruh bekor bo‘ladi va to‘lov to‘liq qaytariladi.')}</p>
        ${g.mine ? html`<div class="card ok-box">${t('Siz bu guruhdasiz')}: <b>${num(g.mine.qty)} ${p.unit}</b> (${g.mine.status === 'paid' ? t('to‘langan') : t('to‘lov kutilmoqda')}). <a href="/profile/orders/${g.mine.orderId}" data-link>${t('Buyurtmani ko‘rish')}</a></div>` : ''}
        ${
          can
            ? html`<div class="buybox card"><h3>${t('Guruhga qo‘shilish')}</h3>
          <div class="qty"><button type="button" class="btn" data-dec aria-label="−">−</button><input id="qty" type="number" inputmode="numeric" min="${min}" max="${Math.min(g.remainingQty, p.stockQty)}" step="${p.packSize}" value="${min}" aria-label="${t('Miqdor')}"><button type="button" class="btn" data-inc aria-label="+">+</button><span>${p.unit}</span></div>
          <div class="sum" id="sum"></div>
          <button class="btn primary block" id="join">${t('Qo‘shilish')}</button></div>`
            : !g.mine
              ? html`<p class="warn-text">${g.joinable ? t('Hozir qo‘shilib bo‘lmaydi (joy yoki zaxira yetarli emas).') : t('Bu guruh yangi ishtirokchilarni qabul qilmaydi.')}</p>`
              : ''
        }
        <button class="btn block" id="share">${t('Do‘stlarga ulashish')}</button>
      </div>
    </div>`,
    mount: (el) => {
      const stop = liveCountdowns(el);
      el.querySelector('#share').onclick = async () => {
        if (navigator.share) {
          try {
            await navigator.share({ title: p.title, text: t('Arzon.uz guruhiga qo‘shiling'), url });
            return;
          } catch {
            /* cancelled */
          }
        }
        copyText(url);
      };
      if (can) {
        const input = el.querySelector('#qty');
        const upd = (q) => {
          const total = g.committedQty + q;
          let tp = p.tiers[0];
          for (const x of p.tiers) if (total >= x.minQty) tp = x;
          el.querySelector('#sum').innerHTML = String(
            html`<div class="row between"><span>${t('Hozirgi narx (qo‘shilgandan so‘ng)')}</span><b>${money(tp.unitPrice)}</b></div><div class="row between"><span>${t('Mahsulotlar')}</span><b>${money(tp.unitPrice * q)}</b></div>${savingRows(p.retail, tp.unitPrice, q, p.unit)}`,
          );
        };
        stepper(el, input, p.packSize, min, Math.min(g.remainingQty, p.stockQty), upd)(min);
        el.querySelector('#join').onclick = () => navigate(`/checkout?group=${g.id}&qty=${input.value}`);
      }
      return stop;
    },
  };
});

// ------------------------------------------------------------------ checkout
route('/checkout', async ({ query }) => {
  if (!state.user) throw Object.assign(new Error('auth'), { status: 401 });
  const groupId = query.get('group'),
    productId = query.get('product');
  const qty0 = Number(query.get('qty')) || 1;
  const [addresses, zones] = await Promise.all([api('GET', '/me/addresses'), api('GET', '/zones')]);
  const ctx = {
    addressId: addresses[0]?.id ?? null,
    qty: qty0,
    slot: 'day',
    quote: null,
    key: crypto.randomUUID(),
  };
  const kind = groupId ? 'group' : 'individual';
  const body = () => ({
    type: kind,
    groupId: groupId ? Number(groupId) : undefined,
    productId: productId ? Number(productId) : undefined,
    qty: ctx.qty,
  });
  return {
    html: html`<h1>${kind === 'group' ? t('Guruhga qo‘shilish — buyurtma') : t('Buyurtmani rasmiylashtirish')}</h1>
    <div class="checkout"><div>
      <section class="card"><h3>1. ${t('Yetkazib berish manzili')}</h3><div id="addr"></div></section>
      <section class="card"><h3>2. ${t('Yetkazib berish vaqti')}</h3>
        <select id="slot" aria-label="${t('Yetkazish vaqti')}">${Object.entries(SLOT).map(([k, v]) => html`<option value="${k}" ${k === 'day' ? raw('selected') : ''}>${t(v)}</option>`)}</select>
        <p class="small muted">${t('Aniq vaqt oralig‘i buyurtma tasdiqlangach, operator tomonidan belgilanadi.')}</p></section>
    </div>
    <aside class="card sticky"><h3>${t('Buyurtma')}</h3><div id="quote"><div class="loading">…</div></div>
      <details class="terms"><summary>${t('Bekor qilish, refund va yetkazib berish shartlari')}</summary><ul class="small">
        <li>${t('To‘lov 15 daqiqa ichida amalga oshirilmasa, band qilingan zaxira/joy bo‘shatiladi.')}</li>
        <li>${t('To‘langan individual buyurtmani tayyorlash boshlanguncha bekor qilish mumkin; mablag‘ qaytarish (refund) operator tomonidan kuzatiladi.')}</li>
        <li>${t('Guruhli xaridda muddat tugagunga qadar limit to‘lmasa, guruh bekor bo‘ladi va to‘lov to‘liq qaytariladi.')}</li>
        <li>${t('Guruh yakuniy narxi sizning to‘lagan narxingizdan past bo‘lsa, farq qaytariladi.')}</li>
        <li>${t('Yetkazib berish narxi hududga qarab belgilanadi va yuqorida ko‘rsatilgan.')}</li></ul></details>
      <label class="check"><input type="checkbox" id="agree"> ${t('Shartlar bilan tanishdim va roziman')}</label>
      <button class="btn primary block" id="confirm" disabled>${t('Tasdiqlash va to‘lash')}</button></aside></div>`,
    mount: (el) => {
      const $ = (s) => el.querySelector(s);
      const confirmBtn = $('#confirm');
      const renderAddr = () => {
        $('#addr').innerHTML = String(html`
          ${addresses.length ? html`<div class="radios">${addresses.map((a) => html`<label class="radio"><input type="radio" name="addr" value="${a.id}" ${a.id === ctx.addressId ? raw('checked') : ''}><span><b>${a.label}</b> — ${a.street}${a.details ? ', ' + a.details : ''}<br><small class="muted">${a.zoneName} · ${t('yetkazish')} ${money(a.zoneFee)}</small></span></label>`)}</div>` : html`<p class="muted">${t('Avval manzil qo‘shing.')}</p>`}
          <details ${addresses.length ? '' : raw('open')}><summary>+ ${t('Yangi manzil')}</summary>
          <form id="newaddr" class="form"><input name="label" placeholder="${t('Nomi (Uy, Ish…)')}" value="Uy" required maxlength="40">
            <select name="zoneId" required>${zones.map((z) => html`<option value="${z.id}">${z.name} — ${money(z.fee)}</option>`)}</select>
            <input name="street" placeholder="${t('Ko‘cha, uy raqami')}" required minlength="3" maxlength="200">
            <input name="details" placeholder="${t('Qavat, xonadon, mo‘ljal (ixtiyoriy)')}" maxlength="200"><button class="btn">${t('Saqlash')}</button></form></details>`);
        $('#addr')
          .querySelectorAll('input[name=addr]')
          .forEach(
            (r) =>
              (r.onchange = () => {
                ctx.addressId = Number(r.value);
                refresh();
              }),
          );
        $('#newaddr').onsubmit = (e) => {
          e.preventDefault();
          guarded(e.submitter, async () => {
            const f = formData(e.target);
            const list = await api('POST', '/me/addresses', { ...f, zoneId: Number(f.zoneId) });
            addresses.splice(0, addresses.length, ...list);
            ctx.addressId = list[0].id;
            renderAddr();
            refresh();
          });
        };
      };
      const refresh = async () => {
        const addr = addresses.find((a) => a.id === ctx.addressId);
        if (!addr) {
          $('#quote').innerHTML = String(
            html`<p class="muted">${t('Yakuniy summani ko‘rish uchun manzilni tanlang.')}</p>`,
          );
          sync();
          return;
        }
        try {
          ctx.quote = await api('POST', '/checkout/quote', { ...body(), zoneId: addr.zoneId });
          const q = ctx.quote;
          $('#quote').innerHTML = String(html`<div class="row"><b>${q.title}</b></div>
            <div class="row between"><span>${num(q.qty)} ${q.unit} × ${money(q.unitPrice)}</span><b>${money(q.subtotal)}</b></div>
            <div class="row between"><span>${t('Yetkazib berish')} (${q.zone.name})</span><b>${money(q.deliveryFee)}</b></div>
            <div class="row between total"><span>${t('Jami')}</span><b>${money(q.total)}</b></div>
            ${q.savings ? html`<div class="ok small">${t('Bozor narxiga nisbatan tejash')}: ${money(q.savings)}</div>` : ''}
            ${q.priceFinalNote ? html`<p class="small muted">${q.priceFinalNote}</p>` : ''}`);
        } catch (e) {
          ctx.quote = null;
          const av = e.details?.availableQty;
          $('#quote').innerHTML = String(
            html`<p class="warn-text">${e.message}</p>${av && av >= 1 ? html`<button class="btn" id="fit">${t('Mavjud miqdorni qo‘llash')}: ${num(av)}</button>` : ''}<button class="btn ghost" id="back">${t('Orqaga')}</button>`,
          );
          $('#back').onclick = () => history.back();
          const fit = $('#fit');
          if (fit)
            fit.onclick = () => {
              ctx.qty = av;
              refresh();
            };
        }
        sync();
      };
      const sync = () => {
        confirmBtn.disabled = !(ctx.quote && $('#agree').checked && ctx.addressId);
      };
      $('#agree').onchange = sync;
      $('#slot').onchange = (e) => (ctx.slot = e.target.value);
      confirmBtn.onclick = () =>
        guarded(confirmBtn, async () => {
          const path = kind === 'group' ? `/groups/${groupId}/join` : '/orders/individual';
          const out = await api(
            'POST',
            path,
            { productId: body().productId, qty: ctx.qty, addressId: ctx.addressId, slot: ctx.slot },
            { 'Idempotency-Key': ctx.key },
          );
          const intent = await api('POST', '/payments/intent', { orderId: out.orderId });
          location.href = intent.checkoutUrl; // provider-hosted checkout; paid status arrives via server webhook
        });
      renderAddr();
      refresh();
    },
  };
});
