import { html, raw, t, money, num, dt, remaining, badge, ORDER_STATUS, GROUP_STATUS, api, route, state, navigate, toast, guarded, formData } from './core.js';
import { progress } from './shop.js';

export const tabs = (base, items, cur) => html`<div class="tabs" role="tablist">${items.map(([k, l, n]) => html`<a role="tab" class="tab ${k === cur ? 'on' : ''}" href="${base}/${k}" data-link>${t(l)}${n ? html` <span class="pill">${n}</span>` : ''}</a>`)}</div>`;
const PSTATUS = { pending: ['Moderatsiyada', 'warn'], active: ['Faol', 'ok'], rejected: ['Rad etilgan', 'bad'], archived: ['Arxiv', ''] };

route('/seller', () => navigate('/seller/products', true), { roles: ['seller'] });
route('/seller/:tab', async ({ params }) => {
  const tab = params[0];
  const head = html`<h1>${t('Sotuvchi paneli')} · ${state.user.shop_name || ''}</h1>
    ${state.user.status !== 'active' ? html`<div class="card warn-box">${t('Do‘koningiz administrator tomonidan tasdiqlanmagan. Tasdiqlangach mahsulot qo‘shish va buyurtmalarni boshqarish mumkin bo‘ladi.')}</div>` : ''}
    ${tabs('/seller', [['products', 'Mahsulotlar'], ['groups', 'Guruhlar'], ['orders', 'Buyurtmalar']], tab)}`;
  if (tab === 'products') return products(head);
  if (tab === 'groups') return groups(head);
  if (tab === 'orders') return orders(head);
  throw Object.assign(new Error('Topilmadi'), { status: 404 });
}, { roles: ['seller'] });

// ------------------------------------------------------------------ products
async function products(head) {
  const [list, cats] = await Promise.all([api('GET', '/seller/products'), api('GET', '/categories')]);
  const row = (p) => html`<div class="card"><div class="row between"><b>${p.title}</b>${badge(PSTATUS, p.status)}</div>
    <div class="small muted">${t('Zaxira')}: ${num(p.stockQty)} ${p.unit} · ${t('Min.')} ${num(p.minIndividualQty)} · ${p.tiers.map((x) => `${num(x.minQty)}+ → ${num(x.unitPrice)}`).join(' | ')}</div>
    ${p.retailDraft?.price ? html`<div class="small muted">${t('Chakana')}: ${money(p.retailDraft.price)} (${p.retailDraft.verified ? t('tasdiqlangan') : t('tasdiqlanmagan — tejash ko‘rsatilmaydi')})</div>` : ''}
    <div class="row gap"><button class="btn sm" data-edit="${p.id}">${t('Tahrirlash')}</button>${p.status === 'archived' ? html`<button class="btn sm" data-st="${p.id}:pending">${t('Qayta yuborish')}</button>` : html`<button class="btn sm" data-st="${p.id}:archived">${t('Arxivlash')}</button>`}</div></div>`;
  return {
    html: html`${head}<div class="row between"><h2>${t('Mahsulotlarim')}</h2><button class="btn primary" id="new">+ ${t('Yangi mahsulot')}</button></div>
      ${list.length ? list.map(row) : html`<p class="muted">${t('Hali mahsulot yo‘q.')}</p>`}
      <dialog id="dlg"><form id="pf" class="form" method="dialog"></form></dialog>`,
    mount: (el) => {
      const dlg = el.querySelector('#dlg'), pf = el.querySelector('#pf');
      const open = (p) => {
        const tiers = p?.tiers?.length ? p.tiers : [{ minQty: '', unitPrice: '' }];
        pf.innerHTML = String(html`<h3>${p ? t('Mahsulotni tahrirlash') : t('Yangi mahsulot')}</h3>
          <label>${t('Nomi')}<input name="title" value="${p?.title || ''}" required minlength="3" maxlength="120"></label>
          <div class="cols"><label>${t('Kategoriya')}<select name="categoryId">${cats.map((c) => html`<option value="${c.id}" ${p?.categoryId === c.id ? raw('selected') : ''}>${c.name}</option>`)}</select></label>
            <label>${t('Belgi (emoji)')}<input name="emoji" value="${p?.emoji || '📦'}" maxlength="8"></label></div>
          <label>${t('Tavsif')}<textarea name="description" rows="3" maxlength="2000">${p?.description || ''}</textarea></label>
          <div class="cols"><label>${t('O‘lchov birligi')}<input name="unit" value="${p?.unit || 'kg'}" required maxlength="20"></label>
            <label>${t('Qadoq miqdori')}<input name="packSize" type="number" min="1" value="${p?.packSize || 1}" required></label></div>
          <div class="cols"><label>${t('Minimal shaxsiy buyurtma')}<input name="minIndividualQty" type="number" min="1" value="${p?.minIndividualQty || ''}" required></label>
            <label>${t('Zaxira')}<input name="stockQty" type="number" min="0" value="${p?.stockQty ?? ''}" required></label></div>
          <fieldset><legend>${t('Narx bosqichlari (miqdor oshgani sari narx pasayadi)')}</legend><div id="tiers">${tiers.map(tierRow)}</div><button type="button" class="btn sm" id="addtier">+ ${t('Bosqich')}</button></fieldset>
          <div class="cols"><label>${t('Chakana taqqoslash narxi (ixtiyoriy)')}<input name="retailPrice" type="number" min="1" value="${p?.retailDraft?.price || ''}"></label>
            <label>${t('Narx manbasi (dalil)')}<input name="retailSource" value="${p?.retailDraft?.source || ''}" maxlength="200" placeholder="${t('masalan: Korzinka, 2026-10')}"></label></div>
          <p class="small muted">${t('Chakana narx administrator tomonidan tekshirilmaguncha “tejash” ko‘rsatilmaydi. Nom/tavsif/narx o‘zgarsa mahsulot qayta moderatsiyaga yuboriladi.')}</p>
          <div class="row gap"><button class="btn primary" value="save">${t('Saqlash')}</button><button class="btn" value="cancel" formnovalidate>${t('Yopish')}</button></div>`);
        wire(p);
        dlg.showModal();
      };
      const tierRow = (x) => html`<div class="cols tier"><input type="number" min="1" name="tq" placeholder="${t('Miqdordan')}" value="${x.minQty}" required><input type="number" min="1" name="tp" placeholder="${t('Birlik narxi (so‘m)')}" value="${x.unitPrice}" required><button type="button" class="btn sm" data-rm>✕</button></div>`;
      const wire = (p) => {
        const box = pf.querySelector('#tiers');
        const rm = () => box.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => box.children.length > 1 && b.parentElement.remove()));
        rm();
        pf.querySelector('#addtier').onclick = () => { box.insertAdjacentHTML('beforeend', String(tierRow({ minQty: '', unitPrice: '' }))); rm(); };
        pf.querySelector('[value=cancel]').onclick = () => dlg.close();
        pf.onsubmit = (e) => { e.preventDefault(); if (e.submitter?.value !== 'save') return;
          guarded(e.submitter, async () => {
            const d = formData(pf);
            const qs = [...pf.querySelectorAll('[name=tq]')].map((i) => Number(i.value)), ps = [...pf.querySelectorAll('[name=tp]')].map((i) => Number(i.value));
            const body = { title: d.title, categoryId: Number(d.categoryId), emoji: d.emoji, description: d.description, unit: d.unit, packSize: Number(d.packSize),
              minIndividualQty: Number(d.minIndividualQty), stockQty: Number(d.stockQty), tiers: qs.map((q, i) => ({ minQty: q, unitPrice: ps[i] })) };
            if (d.retailPrice) { body.retailPrice = Number(d.retailPrice); body.retailSource = d.retailSource; } else if (p) body.retailPrice = null;
            await api(p ? 'PATCH' : 'POST', p ? '/seller/products/' + p.id : '/seller/products', body);
            dlg.close(); toast(t('Saqlandi'), 'ok'); navigate('/seller/products', true);
          }); };
      };
      el.querySelector('#new').onclick = () => open(null);
      el.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => open(list.find((x) => x.id === Number(b.dataset.edit)))));
      el.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => guarded(b, async () => { const [id, st] = b.dataset.st.split(':'); await api('PATCH', '/seller/products/' + id, { status: st }); navigate('/seller/products', true); })));
    },
  };
}

// ------------------------------------------------------------------ groups
async function groups(head) {
  const [gs, ps] = await Promise.all([api('GET', '/seller/groups'), api('GET', '/seller/products')]);
  const active = ps.filter((p) => p.status === 'active');
  return {
    html: html`${head}<h2>${t('Yangi guruh')}</h2>
    ${active.length ? html`<form id="gf" class="form card"><select name="productId">${active.map((p) => html`<option value="${p.id}">${p.title}</option>`)}</select>
      <div class="cols"><label>${t('Maqsad miqdor')}<input name="targetQty" type="number" min="1" required></label><label>${t('Ishtirokchi minimali')}<input name="minMemberQty" type="number" min="1" placeholder="${t('qadoq')}"></label>
        <label>${t('Muddat (soat)')}<input name="durationHours" type="number" min="1" placeholder="48"></label></div><button class="btn primary">${t('Guruh ochish')}</button></form>` : html`<p class="muted">${t('Guruh ochish uchun faol mahsulot kerak.')}</p>`}
    <h2>${t('Guruhlarim')}</h2>${gs.length ? gs.map((g) => html`<div class="card"><div class="row between"><b>${g.product.title}</b>${badge(GROUP_STATUS, g.status)}</div>${progress(g.committedQty, g.targetQty)}
      <div class="row between small"><span>${num(g.committedQty)} / ${num(g.targetQty)} ${g.product.unit} (${t('to‘langan')}: ${num(g.paidQty)})</span><span class="muted">${g.status === 'open' ? remaining(g.endsAt) : dt(g.closedAt)}</span></div></div>`) : html`<p class="muted">—</p>`}`,
    mount: (el) => {
      const f = el.querySelector('#gf'); if (!f) return;
      f.onsubmit = (e) => { e.preventDefault(); guarded(e.submitter, async () => {
        const d = formData(f); const body = { productId: Number(d.productId), targetQty: Number(d.targetQty) };
        if (d.minMemberQty) body.minMemberQty = Number(d.minMemberQty); if (d.durationHours) body.durationHours = Number(d.durationHours);
        await api('POST', '/seller/groups', body); toast(t('Guruh ochildi'), 'ok'); navigate('/seller/groups', true); }); };
    },
  };
}

// ------------------------------------------------------------------ orders
async function orders(head) {
  const list = await api('GET', '/seller/orders');
  const NEXT = { confirmed: ['preparing', 'Zaxirani tasdiqlash / tayyorlash'], preparing: ['ready_for_delivery', 'Tayyor'] };
  return {
    html: html`${head}<h2>${t('Buyurtmalar')}</h2>${list.length ? list.map((o) => { const it = o.items[0]; const n = NEXT[o.status]; return html`<div class="card"><div class="row between"><b>#${o.id} · ${it.title}</b>${badge(ORDER_STATUS, o.status)}</div>
      <div class="small muted">${num(it.qty)} ${it.unit} × ${money(it.unitPrice)} = ${money(o.subtotal)} · ${o.buyer} · ${o.zone} · ${dt(o.createdAt)}</div>
      ${o.waitingForGroup ? html`<div class="small warn-text">${t('Guruh limiti to‘lishi kutilmoqda — tayyorlash hali mumkin emas')} (${num(o.group.committedQty)}/${num(o.group.targetQty)})</div>` : n ? html`<button class="btn sm primary" data-next="${o.id}:${n[0]}">${t(n[1])}</button>` : ''}</div>`; }) : html`<p class="muted">${t('Buyurtmalar yo‘q.')}</p>`}`,
    mount: (el) => el.querySelectorAll('[data-next]').forEach((b) => (b.onclick = () => guarded(b, async () => { const [id, st] = b.dataset.next.split(':'); await api('PATCH', `/seller/orders/${id}/status`, { status: st }); navigate('/seller/orders', true); }))),
  };
}
