import {
  html,
  t,
  money,
  num,
  badge,
  GROUP_STATUS,
  api,
  navigate,
  guarded,
  formData,
  toast,
  tick,
  copyText,
} from './core.js';

const p2n = (n) => String(n).padStart(2, '0');
export const clock = (iso) => {
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
export const groupStats = (g) => ({
  pct: Math.min(100, Math.round((g.committedQty / g.targetQty) * 100)),
  left: Math.max(0, g.targetQty - g.committedQty),
});
export const needLeft = (g, unit) => {
  const { pct, left } = groupStats(g);
  const hot = pct >= 80 && left > 0;
  return html`<div class="need-left ${hot ? 'hot' : ''}">${left > 0 ? html`${hot ? html`${t('Deyarli to‘ldi!')} ` : ''}${t('Yana')} <b>${num(left)} ${unit}</b> ${t('kerak')}` : t('Limit to‘ldi')}</div>`;
};
export const thumbMedia = (p) =>
  p.imageUrl
    ? html`<img src="${p.imageUrl}" alt="${p.title}" loading="lazy">`
    : html`<span class="ico">${p.emoji}</span>`;

export const saving = (retail, price) =>
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
    <div class="row"><div class="thumb sm">${thumbMedia(g.product)}</div><h3>${g.product.title}</h3>${g.status === 'open' ? '' : badge(GROUP_STATUS, g.status)}</div>
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
export const savingsBox = (p) =>
  p.retail
    ? html`<div class="card save-box"><b>${t('Bozor narxiga nisbatan tejash')}</b>
  <p class="small">${t('Bozor narxi')} — ${t('bu mahsulotning do‘kon/bozordagi odatiy narxi')}: <b>${money(p.retail.price)}</b> / ${p.unit}. ${t('Ulgurji yoki guruh bo‘lib olsangiz, har bir birlik shu narxdan arzon bo‘ladi; miqdor qancha ko‘p bo‘lsa, tejash shuncha katta.')}</p>
  <p class="small muted">${t('Manba')}: ${p.retail.source}</p></div>`
    : '';
export const savingRows = (retail, unitPrice, q, unit) => {
  const s = saving(retail, unitPrice);
  return s
    ? html`
  <div class="row between muted"><span>${t('Bozor narxida bo‘lardi')}</span><s>${money(retail.price * q)}</s></div>
  <div class="row between save-line"><span>${t('Sizning tejashingiz')} (${num(q)} ${unit})</span><b>${money(s.amt * q)} (−${s.pct}%)</b></div>`
    : '';
};
export const tierPrice = (tiers, qty) => {
  let p = tiers[0];
  for (const x of tiers) if (qty >= x.minQty) p = x;
  return p;
};

export function liveCountdowns(root) {
  return tick(() =>
    root.querySelectorAll('[data-countdown]').forEach((el) => {
      el.textContent = (el.dataset.label ?? 'Qoldi: ') + clock(el.dataset.countdown);
      el.classList.toggle('urgent', new Date(el.dataset.countdown) - Date.now() < 6 * 3600e3);
    }),
  );
}
export function stepper(root, input, step, min, max, cb) {
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

export const tabs = (base, items, cur) =>
  html`<div class="tabs" role="tablist">${items.map(([k, l, n]) => html`<a role="tab" class="tab ${k === cur ? 'on' : ''}" href="${base}/${k}" data-link>${t(l)}${n ? html` <span class="pill">${n}</span>` : ''}</a>`)}</div>`;

/** Wires the "open a group" form (#gf) of a panel page: POST to `endpoint`, then reload that page. */
export function bindGroupForm(root, endpoint) {
  const f = root.querySelector('#gf');
  if (!f) return;
  f.onsubmit = (e) => {
    e.preventDefault();
    guarded(e.submitter, async () => {
      const d = formData(f);
      const body = { productId: Number(d.productId), targetQty: Number(d.targetQty) };
      if (d.minMemberQty) body.minMemberQty = Number(d.minMemberQty);
      if (d.durationHours) body.durationHours = Number(d.durationHours);
      await api('POST', endpoint, body);
      toast(t('Guruh ochildi'), 'ok');
      navigate(endpoint, true);
    });
  };
}

// ---- group rooms: a group's own page, entered by a short code or a shared link
export const roomLink = (code) => `${location.origin}/room/${code}`;

export const roomEntry = () => html`<form class="card room-entry" id="room-entry">
  <label for="room-code"><b>${t('Guruh kodingiz bormi?')}</b> ${t('Kodni yoki havolani kiriting')}</label>
  <div class="row gap"><input id="room-code" name="code" placeholder="K7M4QX" autocomplete="off" autocapitalize="characters" maxlength="120" required>
  <button class="btn primary">${t('Xonaga kirish')}</button></div></form>`;

export function bindRoomEntry(root) {
  const f = root.querySelector('#room-entry');
  if (!f) return;
  f.onsubmit = (e) => {
    e.preventDefault();
    const typed = f.code.value.trim();
    const fromLink = typed.match(/\/room\/([A-Za-z0-9-]+)/);
    const code = (fromLink ? fromLink[1] : typed).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code) navigate('/room/' + code);
  };
}

/** Copy-code / copy-link / share buttons of a room (markup: data-copy-code, data-copy-link, data-share). */
export function bindRoomShare(root, group) {
  const url = roomLink(group.code);
  const on = (sel, fn) => {
    const el = root.querySelector(sel);
    if (el) el.onclick = fn;
  };
  on('[data-copy-code]', () => copyText(group.code, t('Kod nusxalandi')));
  on('[data-copy-link]', () => copyText(url));
  on('[data-share]', async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: group.product.title, text: `${t('Guruh kodi')}: ${group.code}`, url });
        return;
      } catch {
        /* cancelled */
      }
    }
    copyText(url);
  });
}
