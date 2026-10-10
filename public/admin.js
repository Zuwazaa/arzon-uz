import {
  html, raw, t, money, num, dt, pct, remaining, badge, ORDER_STATUS, GROUP_STATUS, PAY_STATUS, REFUND_STATUS, DELIVERY_STATUS, SLOT,
  api, route, navigate, toast, guarded, formData,
} from './core.js';
import { tabs } from './seller.js';
import { progress } from './shop.js';

route('/admin', () => navigate('/admin/stats', true), { roles: ['admin'] });
route('/admin/:tab', async ({ params }) => {
  const tab = params[0];
  const stats = await api('GET', '/admin/stats');
  const p = stats.pending;
  const head = html`<h1>${t('Admin paneli')}</h1>${tabs('/admin', [['stats', 'Ko‘rsatkichlar'], ['orders', 'Buyurtmalar', p.refunds], ['deliveries', 'Yetkazish', p.toSchedule], ['groups', 'Guruhlar'], ['moderation', 'Moderatsiya', p.sellers + p.products], ['settings', 'Sozlamalar']], tab)}`;
  const pages = { stats: () => statsPage(head, stats), orders: () => ordersPage(head), deliveries: () => deliveriesPage(head), groups: () => groupsPage(head), moderation: () => moderationPage(head), settings: () => settingsPage(head) };
  if (!pages[tab]) throw Object.assign(new Error('Topilmadi'), { status: 404 });
  return pages[tab]();
}, { roles: ['admin'] });

const act = (el, sel, fn, reload) => el.querySelectorAll(sel).forEach((b) => (b.onclick = () => guarded(b, async () => { await fn(b); if (reload !== false) navigate(location.pathname + location.search, true); })));

// ------------------------------------------------------------------ stats
function statsPage(head, s) {
  const card = (v, l, hint) => html`<div class="stat"><b>${v}</b><span>${t(l)}</span>${hint ? html`<small>${t(hint)}</small>` : ''}</div>`;
  return html`${head}<p class="muted small">${t('Oxirgi')} ${s.days} ${t('kun')}. ${t('Pilot maqsadlari real ma’lumot to‘plangach belgilanadi.')}</p>
    <div class="stats">
      ${card(pct(s.groupCompletionRate), 'Group completion rate', `${s.groupsSuccessful} ${t('muvaffaqiyatli')} / ${s.groupsFailed} ${t('muvaffaqiyatsiz')}`)}
      ${card(money(s.realSavings), 'Real savings', 'faqat tekshirilgan bozor narxi bo‘yicha')}
      ${card(s.deliveryCostPerOrder === null ? '—' : money(s.deliveryCostPerOrder), 'Delivery cost per order')}
      ${card(pct(s.onTimeRate), 'On-time delivery rate')}
      ${card(pct(s.repeatPurchaseRate), 'Repeat purchase rate')}
      ${card(s.contributionPerOrder === null ? '—' : money(s.contributionPerOrder), 'Contribution per order', 'komissiya + yetkazish to‘lovi − haqiqiy xarajat − to‘lov komissiyasi')}
      ${card(pct(s.cancellationRefundRate), 'Cancellation/refund rate')}
      ${card(`${num(s.paidOrders)} / ${num(s.deliveredOrders)}`, 'To‘langan / yetkazilgan buyurtmalar')}
    </div>`;
}

// ------------------------------------------------------------------ orders & refunds
async function ordersPage(head) {
  const sp = new URLSearchParams(location.search);
  const list = await api('GET', '/admin/orders?' + sp);
  return {
    html: html`${head}<form class="filters" id="of"><select name="status"><option value="">${t('Barcha holatlar')}</option>${Object.entries(ORDER_STATUS).map(([k, [l]]) => html`<option value="${k}" ${sp.get('status') === k ? raw('selected') : ''}>${t(l)}</option>`)}</select>
      <label class="check"><input type="checkbox" name="refund" value="1" ${sp.get('refund') ? raw('checked') : ''}> ${t('Faqat refund kutilayotganlar')}</label></form>
    ${list.length ? list.map((o) => { const it = o.items[0]; const pay = o.payment; return html`<div class="card">
      <div class="row between"><b>#${o.id} · ${it.title} × ${num(it.qty)}</b>${badge(ORDER_STATUS, o.status)}</div>
      <div class="small muted">${o.address.name} · ${o.address.phone} · ${o.address.zoneName} · ${dt(o.createdAt)} · ${o.type === 'group' ? t('Guruh') + ' #' + o.group?.id : t('Individual')}</div>
      <div class="row between"><span>${money(o.total)} · ${t('To‘lov')}: <b>${t(PAY_STATUS[pay?.status] || '—')}</b></span>
        ${pay && pay.refundStatus !== 'none' ? html`<span class="warn-text">${t('Refund')}: ${money(pay.refundAmount)} · ${t(REFUND_STATUS[pay.refundStatus])}</span>` : ''}</div>
      <div class="row gap wrap">
        ${['confirmed'].includes(o.status) && !o.waitingForGroup ? html`<button class="btn sm" data-st="${o.id}:preparing">${t('Tayyorlash')}</button>` : ''}
        ${o.status === 'preparing' ? html`<button class="btn sm" data-st="${o.id}:ready_for_delivery">${t('Tayyor')}</button>` : ''}
        ${['pending_payment', 'confirmed', 'preparing', 'ready_for_delivery'].includes(o.status) ? html`<button class="btn sm bad" data-st="${o.id}:cancelled">${t('Bekor qilish')}</button>` : ''}
        ${o.delivery?.status === 'delivery_failed' ? html`<button class="btn sm bad" data-fail="${o.id}">${t('Yetkazilmadi — failed')}</button>` : ''}
        ${pay?.status === 'paid' && pay.refundStatus === 'none' && !['delivered', 'cancelled', 'failed'].includes(o.status) ? html`<button class="btn sm" data-rs="${o.id}">${t('Refund boshlash')}</button>` : ''}
        ${pay?.refundStatus === 'refund_pending' ? html`<button class="btn sm primary" data-rc="${o.id}">${t('Refund bajarildi')}</button>` : ''}
      </div></div>`; }) : html`<p class="muted">${t('Buyurtmalar yo‘q.')}</p>`}`,
    mount: (el) => {
      const f = el.querySelector('#of');
      f.onchange = () => { const p = new URLSearchParams(); for (const [k, v] of new FormData(f)) if (v) p.set(k, v); navigate('/admin/orders?' + p, true); };
      act(el, '[data-st]', (b) => { const [id, st] = b.dataset.st.split(':'); return api('PATCH', `/admin/orders/${id}/status`, { status: st }); });
      act(el, '[data-fail]', (b) => api('POST', `/admin/orders/${b.dataset.fail}/mark-failed`, {}));
      act(el, '[data-rs]', (b) => api('POST', `/admin/orders/${b.dataset.rs}/refund`, { action: 'start', note: 'Admin tomonidan' }));
      act(el, '[data-rc]', (b) => api('POST', `/admin/orders/${b.dataset.rc}/refund`, { action: 'complete' }));
    },
  };
}

// ------------------------------------------------------------------ deliveries
async function deliveriesPage(head) {
  const list = await api('GET', '/admin/deliveries');
  const local = (iso) => { const d = new Date(iso || Date.now() + 3600e3); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  return {
    html: html`${head}${list.length ? list.map((d) => html`<div class="card"><div class="row between"><b>${t('Buyurtma')} #${d.orderId}</b><span class="badge info">${t(DELIVERY_STATUS[d.status])}</span></div>
      <div class="small muted">${d.zone} · ${d.address.street} · ${d.address.name} ${d.address.phone} · ${t(SLOT[d.slot] || '')} · ${t('to‘lov')} ${money(d.fee)}</div>
      <div class="small">${d.scheduledAt ? `${dt(d.scheduledAt)} – ${dt(d.windowEnd)}` : t('Vaqt belgilanmagan')} ${d.courier ? '· ' + d.courier : ''} ${d.actualCost !== null ? '· ' + t('xarajat') + ' ' + money(d.actualCost) : ''}</div>
      ${d.status !== 'delivered' ? html`<form class="form inline" data-did="${d.id}">
        <input type="datetime-local" name="scheduledAt" value="${local(d.scheduledAt)}" aria-label="${t('Vaqt')}"><input name="courier" placeholder="${t('Kuryer / hamkor')}" value="${d.courier || ''}">
        <input name="actualCost" type="number" min="0" placeholder="${t('Haqiqiy xarajat')}" value="${d.actualCost ?? ''}">
        <select name="status">${[['', 'Holat…'], ['scheduled', 'Rejalashtirish'], ['out_for_delivery', 'Yo‘lga chiqdi'], ['delivered', 'Yetkazildi'], ['delivery_failed', 'Yetkazilmadi']].map(([v, l]) => html`<option value="${v}">${t(l)}</option>`)}</select>
        <button class="btn sm primary">${t('Saqlash')}</button></form>` : ''}</div>`) : html`<p class="muted">${t('Yetkazib berishlar yo‘q.')}</p>`}`,
    mount: (el) => el.querySelectorAll('form[data-did]').forEach((f) => (f.onsubmit = (e) => { e.preventDefault(); guarded(e.submitter, async () => {
      const d = formData(f); const body = {};
      if (d.courier) body.courier = d.courier;
      if (d.actualCost !== '') body.actualCost = Number(d.actualCost);
      if (d.status) body.status = d.status;
      if (d.scheduledAt && (d.status === 'scheduled' || !d.status)) body.scheduledAt = new Date(d.scheduledAt).toISOString();
      await api('PATCH', '/admin/deliveries/' + f.dataset.did, body); toast(t('Saqlandi'), 'ok'); navigate('/admin/deliveries', true); }); })),
  };
}

// ------------------------------------------------------------------ groups
async function groupsPage(head) {
  const [gs, ps] = await Promise.all([api('GET', '/admin/groups'), api('GET', '/admin/products?status=active')]);
  return {
    html: html`${head}<h2>${t('Yangi guruh')}</h2><form id="gf" class="form card"><select name="productId">${ps.map((p) => html`<option value="${p.id}">${p.title} (${p.sellerName})</option>`)}</select>
      <div class="cols"><label>${t('Maqsad miqdor')}<input name="targetQty" type="number" min="1" required></label><label>${t('Ishtirokchi minimali')}<input name="minMemberQty" type="number" min="1"></label><label>${t('Muddat (soat)')}<input name="durationHours" type="number" min="1" placeholder="48"></label></div>
      <button class="btn primary">${t('Guruh ochish')}</button></form>
    <h2>${t('Guruhlar')}</h2>${gs.map((g) => html`<div class="card"><div class="row between"><b>#${g.id} · ${g.product.title}</b>${badge(GROUP_STATUS, g.status)}</div>${progress(g.committedQty, g.targetQty)}
      <div class="row between small"><span>${num(g.committedQty)} / ${num(g.targetQty)} (${t('to‘langan')} ${num(g.paidQty)}) · ${g.members} ${t('ishtirokchi')}</span><span class="muted">${g.status === 'open' ? remaining(g.endsAt) : dt(g.closedAt)}</span></div>
      ${['open', 'threshold_met'].includes(g.status) ? html`<button class="btn sm bad" data-cancel="${g.id}">${t('Bekor qilish (refund bilan)')}</button>` : ''}</div>`)}`,
    mount: (el) => {
      const f = el.querySelector('#gf');
      f.onsubmit = (e) => { e.preventDefault(); guarded(e.submitter, async () => { const d = formData(f); const body = { productId: Number(d.productId), targetQty: Number(d.targetQty) };
        if (d.minMemberQty) body.minMemberQty = Number(d.minMemberQty); if (d.durationHours) body.durationHours = Number(d.durationHours);
        await api('POST', '/admin/groups', body); toast(t('Guruh ochildi'), 'ok'); navigate('/admin/groups', true); }); };
      act(el, '[data-cancel]', (b) => confirm(t('Guruh bekor qilinsinmi? Barcha to‘lovlar qaytariladi.')) && api('POST', `/admin/groups/${b.dataset.cancel}/cancel`, {}));
    },
  };
}

// ------------------------------------------------------------------ moderation
async function moderationPage(head) {
  const [sellers, prods] = await Promise.all([api('GET', '/admin/sellers'), api('GET', '/admin/products')]);
  return {
    html: html`${head}<h2>${t('Sotuvchilar')}</h2>${sellers.map((s) => html`<div class="card row between"><div><b>${s.shopName}</b> <span class="muted small">${s.name} · ${s.phone}</span></div>
      <div class="row gap"><span class="badge ${s.status === 'active' ? 'ok' : s.status === 'pending' ? 'warn' : 'bad'}">${s.status}</span>
      ${s.status !== 'active' ? html`<button class="btn sm primary" data-sel="${s.id}:active">${t('Tasdiqlash')}</button>` : ''}${s.status !== 'blocked' ? html`<button class="btn sm bad" data-sel="${s.id}:blocked">${t('Bloklash')}</button>` : ''}</div></div>`)}
    <h2>${t('Mahsulotlar')}</h2>${prods.map((p) => html`<div class="card"><div class="row between"><b>${p.title}</b><span class="badge ${p.status === 'active' ? 'ok' : p.status === 'pending' ? 'warn' : 'bad'}">${p.status}</span></div>
      <div class="small muted">${p.sellerName} · ${p.tiers.map((x) => `${num(x.minQty)}+ → ${num(x.unitPrice)}`).join(' | ')} · ${t('zaxira')} ${num(p.stockQty)}</div>
      ${p.retailDraft.price ? html`<div class="small">${t('Bozor narxi')}: <b>${money(p.retailDraft.price)}</b> — ${p.retailDraft.source} · ${p.retailDraft.verified ? html`<span class="ok">${t('tasdiqlangan')}</span>` : html`<span class="warn-text">${t('tekshirilmagan')}</span>`}</div>` : ''}
      <div class="row gap wrap">${p.status !== 'active' ? html`<button class="btn sm primary" data-pr="${p.id}:status:active">${t('Faollashtirish')}</button>` : ''}${p.status === 'pending' ? html`<button class="btn sm bad" data-pr="${p.id}:status:rejected">${t('Rad etish')}</button>` : ''}
        ${p.status === 'active' ? html`<button class="btn sm" data-pr="${p.id}:status:archived">${t('Arxivlash')}</button>` : ''}
        ${p.retailDraft.price ? html`<button class="btn sm" data-pr="${p.id}:retailVerified:${p.retailDraft.verified ? 0 : 1}">${p.retailDraft.verified ? t('Bozor narxini bekor qilish') : t('Bozor narxini tasdiqlash')}</button>` : ''}</div></div>`)}`,
    mount: (el) => {
      act(el, '[data-sel]', (b) => { const [id, st] = b.dataset.sel.split(':'); return api('PATCH', '/admin/sellers/' + id, { status: st }); });
      act(el, '[data-pr]', (b) => { const [id, k, v] = b.dataset.pr.split(':'); return api('PATCH', '/admin/products/' + id, { [k]: k === 'retailVerified' ? v === '1' : v }); });
    },
  };
}

// ------------------------------------------------------------------ settings, zones, audit
async function settingsPage(head) {
  const [s, zones, audit] = await Promise.all([api('GET', '/admin/settings'), api('GET', '/admin/zones'), api('GET', '/admin/audit')]);
  const L = { group_duration_hours: 'Guruh muddati (soat)', hold_minutes: 'To‘lov muddati (daqiqa)', commission_pct: 'Komissiya (%)', payment_fee_pct: 'To‘lov provayderi komissiyasi (%)', delivery_window_minutes: 'Yetkazish vaqt oralig‘i (daqiqa)' };
  return {
    html: html`${head}<div class="two"><section class="card"><h3>${t('Parametrlar')}</h3><form id="sf" class="form">${Object.keys(L).map((k) => html`<label>${t(L[k])}<input name="${k}" type="number" step="any" min="0" value="${s[k]}" required></label>`)}<button class="btn primary">${t('Saqlash')}</button></form></section>
      <section class="card"><h3>${t('Yetkazish zonalari')}</h3>${zones.map((z) => html`<form class="form inline" data-zid="${z.id}"><input name="name" value="${z.name}" required><input name="fee" type="number" min="0" value="${z.fee}" required><label class="check"><input type="checkbox" name="active" ${z.active ? raw('checked') : ''}> ${t('Faol')}</label><button class="btn sm">${t('Saqlash')}</button></form>`)}
        <form id="zf" class="form inline"><input name="name" placeholder="${t('Yangi zona')}" required><input name="fee" type="number" min="0" placeholder="${t('Narx')}" required><button class="btn sm primary">+</button></form></section></div>
    <h3>${t('Audit jurnali')}</h3><div class="card audit">${audit.map((a) => html`<div class="small"><span class="muted">${dt(a.at)}</span> <b>${a.action}</b> ${a.entity}#${a.entity_id ?? ''} <span class="muted">${a.actor || 'tizim'}</span> <code>${a.detail || ''}</code></div>`)}</div>`,
    mount: (el) => {
      el.querySelector('#sf').onsubmit = (e) => { e.preventDefault(); guarded(e.submitter, async () => { await api('PATCH', '/admin/settings', formData(e.target)); toast(t('Saqlandi'), 'ok'); }); };
      el.querySelector('#zf').onsubmit = (e) => { e.preventDefault(); guarded(e.submitter, async () => { const d = formData(e.target); await api('POST', '/admin/zones', { name: d.name, fee: Number(d.fee) }); navigate('/admin/settings', true); }); };
      el.querySelectorAll('form[data-zid]').forEach((f) => (f.onsubmit = (e) => { e.preventDefault(); guarded(e.submitter, async () => { const d = formData(f);
        await api('PATCH', '/admin/zones/' + f.dataset.zid, { name: d.name, fee: Number(d.fee), active: !!d.active }); toast(t('Saqlandi'), 'ok'); }); }));
    },
  };
}
