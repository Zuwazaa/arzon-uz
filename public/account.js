import {
  html,
  raw,
  t,
  money,
  num,
  dt,
  remaining,
  badge,
  ORDER_STATUS,
  GROUP_STATUS,
  PAY_STATUS,
  REFUND_STATUS,
  DELIVERY_STATUS,
  SLOT,
  api,
  route,
  state,
  navigate,
  toast,
  guarded,
  tick,
  formData,
  loadUser,
  updateChrome,
} from './core.js';

// ------------------------------------------------------------------ auth
const authPage =
  (mode) =>
  async ({ query }) => {
    const next = query.get('next') || '/';
    const reg = mode === 'register';
    return {
      html: html`<div class="auth card"><h1>${reg ? t('Ro‘yxatdan o‘tish') : t('Kirish')}</h1>
    <form id="f" class="form">
      ${reg ? html`<input name="name" placeholder="${t('Ism va familiya')}" required minlength="2" autocomplete="name">` : ''}
      <input name="phone" type="tel" placeholder="+998 90 123 45 67" required autocomplete="tel" inputmode="tel">
      <input name="password" type="password" placeholder="${t('Parol')}${reg ? ' (' + t('kamida 8 belgi') + ')' : ''}" required minlength="${reg ? 8 : 1}" autocomplete="${reg ? 'new-password' : 'current-password'}">
      ${
        reg
          ? html`<label class="check"><input type="checkbox" name="seller" id="isSeller"> ${t('Men sotuvchiman')}</label>
        <input name="shopName" id="shop" placeholder="${t('Do‘kon / kompaniya nomi')}" hidden>`
          : ''
      }
      <button class="btn primary block">${reg ? t('Ro‘yxatdan o‘tish') : t('Kirish')}</button>
    </form>
    <p class="muted">${reg ? html`${t('Hisobingiz bormi?')} <a href="/auth/login?next=${encodeURIComponent(next)}" data-link>${t('Kirish')}</a>` : html`${t('Hisobingiz yo‘qmi?')} <a href="/auth/register?next=${encodeURIComponent(next)}" data-link>${t('Ro‘yxatdan o‘tish')}</a>`}</p></div>`,
      mount: (el) => {
        const f = el.querySelector('#f');
        if (reg)
          el.querySelector('#isSeller').onchange = (e) => {
            el.querySelector('#shop').hidden = !e.target.checked;
            el.querySelector('#shop').required = e.target.checked;
          };
        f.onsubmit = (e) => {
          e.preventDefault();
          guarded(e.submitter, async () => {
            const d = formData(f);
            const body = reg
              ? {
                  name: d.name,
                  phone: d.phone,
                  password: d.password,
                  role: d.seller ? 'seller' : 'buyer',
                  shopName: d.shopName,
                }
              : { phone: d.phone, password: d.password };
            const out = await api('POST', `/auth/${mode}`, body);
            state.user = out.user;
            updateChrome();
            if (out.user.role === 'seller' && reg)
              toast(t('Do‘koningiz administrator tomonidan tasdiqlangach mahsulot qo‘sha olasiz.'), 'info');
            navigate(next.startsWith('/') ? next : '/', true);
          });
        };
      },
    };
  };
route('/auth/login', authPage('login'));
route('/auth/register', authPage('register'));

// ------------------------------------------------------------------ orders
const orderRow = (o) => html`<a class="card order" href="/profile/orders/${o.id}" data-link>
  <div class="row between"><b>#${o.id} · ${o.items[0].title}</b>${badge(ORDER_STATUS, o.status)}</div>
  <div class="row between small muted"><span>${num(o.items[0].qty)} ${o.items[0].unit} · ${o.type === 'group' ? t('Guruhli') : t('Individual')}</span><span>${dt(o.createdAt)}</span></div>
  <div class="row between"><b>${money(o.total)}</b>${o.waitingForGroup ? html`<span class="small warn-text">${t('Guruh limiti kutilmoqda')}</span>` : ''}</div></a>`;

route(
  '/profile/orders',
  async () => {
    const orders = await api('GET', '/orders/me');
    const active = orders.filter((o) => !['delivered', 'cancelled', 'failed'].includes(o.status));
    const past = orders.filter((o) => !active.includes(o));
    return html`<h1>${t('Buyurtmalarim')}</h1>
    ${
      orders.length
        ? html`<h3>${t('Faol')}</h3>${active.length ? active.map(orderRow) : html`<p class="muted">—</p>`}<h3>${t('Oldingi')}</h3>${past.length ? past.map(orderRow) : html`<p class="muted">—</p>`}`
        : html`<div class="empty"><p>${t('Hali buyurtmalar yo‘q.')}</p><a href="/products" data-link class="btn primary">${t('Katalogga o‘tish')}</a></div>`
    }`;
  },
  { roles: ['buyer', 'seller', 'admin'] },
);

route('/profile/orders/:id', async ({ params }) => {
  const id = params[0];
  const load = () => api('GET', '/orders/' + id);
  const o = await load();
  const view = (o) => {
    const it = o.items[0];
    return html`
    <nav class="crumbs"><a href="/profile/orders" data-link>${t('Buyurtmalarim')}</a> / #${o.id}</nav>
    <div class="row between"><h1>${t('Buyurtma')} #${o.id}</h1>${badge(ORDER_STATUS, o.status)}</div>
    ${
      o.status === 'pending_payment'
        ? html`<div class="card warn-box"><b>${t('To‘lov kutilmoqda')}</b> — ${t('qolgan vaqt')}: <b data-countdown="${o.holdExpiresAt}">${remaining(o.holdExpiresAt)}</b>
      <div class="row gap"><button class="btn primary" id="pay">${t('To‘lash')}</button><button class="btn" id="cancel">${t('Bekor qilish')}</button></div></div>`
        : ''
    }
    ${o.payment?.status === 'pending' && o.status !== 'pending_payment' ? html`<p class="muted">${t('To‘lov tasdig‘i kutilmoqda…')}</p>` : ''}
    ${o.waitingForGroup ? html`<div class="card info-box">${t('To‘lovingiz qabul qilindi. Guruh limiti to‘lishini kutyapmiz.')} <a href="/groups/${o.group.id}" data-link>${t('Guruhni ko‘rish')}</a> (${num(o.group.committedQty)}/${num(o.group.targetQty)}, ${remaining(o.group.endsAt)})</div>` : ''}
    <div class="two">
      <section class="card"><h3>${t('Mahsulot')}</h3>
        <div class="row between"><span>${it.title}</span><span>${num(it.qty)} ${it.unit}</span></div>
        <div class="row between muted small"><span>${t('Birlik narxi')}</span><span>${money(it.unitPrice)}${it.paidUnitPrice ? html` <s>${money(it.paidUnitPrice)}</s>` : ''}</span></div>
        <div class="row between"><span>${t('Mahsulotlar')}</span><b>${money(o.subtotal)}</b></div>
        <div class="row between"><span>${t('Yetkazib berish')}</span><b>${money(o.deliveryFee)}</b></div>
        <div class="row between total"><span>${t('Jami')}</span><b>${money(o.total)}</b></div>
        ${o.savings ? html`<div class="ok small">${t('Tejalgan summa')}: ${money(o.savings)}</div>` : ''}
        <div class="small muted">${t('Sotuvchi')}: ${it.sellerName}</div></section>
      <section class="card"><h3>${t('To‘lov')}</h3>
        <div class="row between"><span>${t('Holat')}</span><b>${t(PAY_STATUS[o.payment?.status] || '—')}</b></div>
        ${o.payment?.refundStatus && o.payment.refundStatus !== 'none' ? html`<div class="row between"><span>${t('Qaytarish')}</span><b>${money(o.payment.refundAmount)} · ${t(REFUND_STATUS[o.payment.refundStatus])}</b></div>${o.payment.note ? html`<div class="small muted">${o.payment.note}</div>` : ''}` : ''}
        <h3>${t('Yetkazib berish')}</h3>
        <div class="small">${o.address.zoneName}, ${o.address.street}${o.address.details ? ', ' + o.address.details : ''}</div>
        <div class="small muted">${t(SLOT[o.slot] || '')} · ${t(DELIVERY_STATUS[o.delivery?.status] || '')}${o.delivery?.scheduledAt ? ' · ' + dt(o.delivery.scheduledAt) : ''}</div></section>
    </div>
    <section class="card"><h3>${t('Holatlar tarixi')}</h3><ol class="timeline">${o.events.map((e) => html`<li><b>${t(ORDER_STATUS[e.status]?.[0] || e.status)}</b> <span class="muted small">${dt(e.at)}${e.note ? ' · ' + e.note : ''}</span></li>`)}</ol>
      ${o.canCancel && o.status !== 'pending_payment' ? html`<button class="btn" id="cancel">${t('Buyurtmani bekor qilish')}</button>` : ''}</section>`;
  };
  return {
    html: html`<div id="order">${view(o)}</div>`,
    mount: (el) => {
      const root = el.querySelector('#order');
      let cur = o;
      const bind = () => {
        const pay = root.querySelector('#pay');
        if (pay)
          pay.onclick = () =>
            guarded(pay, async () => {
              location.href = (await api('POST', '/payments/intent', { orderId: cur.id })).checkoutUrl;
            });
        const cancel = root.querySelector('#cancel');
        if (cancel)
          cancel.onclick = () => {
            if (confirm(t('Buyurtmani bekor qilasizmi?')))
              guarded(cancel, async () => {
                cur = await api('POST', `/orders/${cur.id}/cancel`);
                paint();
                toast(t('Buyurtma bekor qilindi'), 'ok');
              });
          };
      };
      const paint = () => {
        root.innerHTML = String(view(cur));
        bind();
      };
      bind();
      const stops = [
        tick(() =>
          root
            .querySelectorAll('[data-countdown]')
            .forEach((n) => (n.textContent = remaining(n.dataset.countdown))),
        ),
        tick(async () => {
          // payment status is confirmed by the provider webhook -> poll
          if (document.hidden) return;
          try {
            const n = await load();
            if (JSON.stringify(n) !== JSON.stringify(cur)) {
              cur = n;
              paint();
            }
          } catch {
            /* ignore */
          }
        }, 5000),
      ];
      return () => stops.forEach((s) => s());
    },
  };
});

// ------------------------------------------------------------------ profile
route(
  '/profile',
  async () => {
    const [sum, addrs, zones] = await Promise.all([
      api('GET', '/me/summary'),
      api('GET', '/me/addresses'),
      api('GET', '/zones'),
    ]);
    const u = state.user;
    const addrList = (list) =>
      list.length
        ? list.map(
            (a) =>
              html`<div class="row between card"><div><b>${a.label}</b> — ${a.street}<div class="small muted">${a.zoneName}</div></div><button class="btn sm" data-del="${a.id}">✕</button></div>`,
          )
        : html`<p class="muted">${t('Manzillar yo‘q.')}</p>`;
    return {
      html: html`<h1>${t('Profil')}</h1>
    <div class="stats"><div class="stat"><b>${num(sum.orders)}</b><span>${t('Buyurtmalar')}</span></div><div class="stat"><b>${money(sum.saved)}</b><span>${t('Tejalgan summa')}</span></div></div>
    <p class="small muted">${t('Tejalgan summa faqat tekshirilgan bozor narxi mavjud mahsulotlar bo‘yicha hisoblanadi.')}</p>
    <div class="two"><section class="card"><h3>${t('Ma’lumotlar')}</h3>
      <form id="me" class="form"><label>${t('Ism')}<input name="name" value="${u.name}" required minlength="2"></label><label>${t('Telefon')}<input value="${u.phone}" disabled></label>
        <label>Email<input name="email" type="email" value="${u.email || ''}"></label><button class="btn primary">${t('Saqlash')}</button></form>
      <h3>${t('Parolni o‘zgartirish')}</h3>
      <form id="pw" class="form"><input name="current" type="password" placeholder="${t('Joriy parol')}" required autocomplete="current-password"><input name="password" type="password" placeholder="${t('Yangi parol (8+)')}" required minlength="8" autocomplete="new-password"><button class="btn">${t('O‘zgartirish')}</button></form></section>
    <section class="card"><h3>${t('Manzillarim')}</h3><div id="addrs">${addrList(addrs)}</div>
      <form id="newaddr" class="form"><input name="label" placeholder="${t('Nomi')}" value="Uy" required maxlength="40"><select name="zoneId">${zones.map((z) => html`<option value="${z.id}">${z.name}</option>`)}</select>
        <input name="street" placeholder="${t('Ko‘cha, uy')}" required minlength="3"><input name="details" placeholder="${t('Izoh (ixtiyoriy)')}"><button class="btn">+ ${t('Manzil qo‘shish')}</button></form></section></div>
    <div class="row gap"><a class="btn" href="/profile/orders" data-link>${t('Buyurtmalarim')}</a><button class="btn bad" id="logout">${t('Chiqish')}</button></div>`,
      mount: (el) => {
        const $ = (s) => el.querySelector(s);
        $('#me').onsubmit = (e) => {
          e.preventDefault();
          guarded(e.submitter, async () => {
            await api('PATCH', '/me', formData(e.target));
            await loadUser();
            updateChrome();
            toast(t('Saqlandi'), 'ok');
          });
        };
        $('#pw').onsubmit = (e) => {
          e.preventDefault();
          guarded(e.submitter, async () => {
            await api('POST', '/me/password', formData(e.target));
            e.target.reset();
            toast(t('Parol yangilandi'), 'ok');
          });
        };
        const bindDel = () =>
          $('#addrs')
            .querySelectorAll('[data-del]')
            .forEach(
              (b) =>
                (b.onclick = () =>
                  guarded(b, async () => {
                    $('#addrs').innerHTML = String(
                      addrList(await api('DELETE', '/me/addresses/' + b.dataset.del)),
                    );
                    bindDel();
                  })),
            );
        bindDel();
        $('#newaddr').onsubmit = (e) => {
          e.preventDefault();
          guarded(e.submitter, async () => {
            const f = formData(e.target);
            $('#addrs').innerHTML = String(
              addrList(await api('POST', '/me/addresses', { ...f, zoneId: Number(f.zoneId) })),
            );
            bindDel();
            e.target.reset();
          });
        };
        $('#logout').onclick = async () => {
          await api('POST', '/auth/logout');
          state.user = null;
          updateChrome();
          navigate('/');
        };
      },
    };
  },
  { roles: ['buyer', 'seller', 'admin'] },
);
