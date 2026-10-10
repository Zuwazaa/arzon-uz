// ---- i18n: gettext-style. Keys are the Uzbek strings; add a dictionary for 'ru' later without touching pages.
const dict = { uz: null };
export const lang = 'uz';
export const t = (s) => (dict[lang] && dict[lang][s]) || s;

// ---- safe HTML templating (escapes interpolations by default)
class Safe {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}
const esc = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const part = (v) =>
  v instanceof Safe
    ? v.s
    : Array.isArray(v)
      ? v.map(part).join('')
      : v === null || v === undefined || v === false
        ? ''
        : esc(v);
export const html = (strings, ...vals) =>
  new Safe(strings.reduce((a, s, i) => a + s + (i < vals.length ? part(vals[i]) : ''), ''));
export const raw = (s) => new Safe(s);

// ---- formatting (money = integer so'm; times arrive in UTC, shown in local time)
export const num = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export const money = (n) => `${num(n)} so‘m`;
const p2 = (n) => String(n).padStart(2, '0');
export const dt = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${p2(d.getDate())}.${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};
export const pct = (v) => (v === null || v === undefined ? '—' : `${Math.round(v * 1000) / 10}%`);
export function remaining(iso) {
  const ms = new Date(iso) - Date.now();
  if (ms <= 0) return 'Tugadi';
  const h = Math.floor(ms / 3600e3),
    m = Math.floor((ms % 3600e3) / 60e3);
  if (h >= 24) return `${Math.floor(h / 24)} kun ${h % 24} soat`;
  return h ? `${h} soat ${m} daq` : `${m} daq ${Math.floor((ms % 60e3) / 1e3)} s`;
}

export const ORDER_STATUS = {
  pending_payment: ['To‘lov kutilmoqda', 'warn'],
  confirmed: ['Tasdiqlangan', 'info'],
  preparing: ['Tayyorlanmoqda', 'info'],
  ready_for_delivery: ['Yetkazishga tayyor', 'info'],
  out_for_delivery: ['Yo‘lda', 'info'],
  delivered: ['Yetkazildi', 'ok'],
  cancelled: ['Bekor qilindi', 'bad'],
  failed: ['Muvaffaqiyatsiz', 'bad'],
};
export const GROUP_STATUS = {
  open: ['Ochiq', 'ok'],
  threshold_met: ['Limit to‘ldi — to‘lovlar kutilmoqda', 'warn'],
  successful: ['Muvaffaqiyatli', 'ok'],
  failed: ['Muvaffaqiyatsiz', 'bad'],
  cancelled: ['Bekor qilindi', 'bad'],
};
export const PAY_STATUS = {
  pending: 'Kutilmoqda',
  paid: 'To‘langan',
  failed: 'Muvaffaqiyatsiz',
  refund_pending: 'Refund kutilmoqda',
  refunded: 'Qaytarilgan',
};
export const REFUND_STATUS = { none: '—', refund_pending: 'Refund kutilmoqda', refunded: 'Qaytarilgan' };
export const DELIVERY_STATUS = {
  not_scheduled: 'Rejalashtirilmagan',
  scheduled: 'Rejalashtirilgan',
  out_for_delivery: 'Yo‘lda',
  delivered: 'Yetkazildi',
  delivery_failed: 'Yetkazilmadi',
};
export const SLOT = { morning: 'Ertalab (09–12)', day: 'Kunduzi (12–17)', evening: 'Kechqurun (17–21)' };
export const badge = (map, key) => {
  const [label, kind] = map[key] || [key, ''];
  return html`<span class="badge ${kind}">${t(label)}</span>`;
};

// ---- api
export class ApiErr extends Error {
  constructor(status, e) {
    super(e?.message || 'Xatolik');
    this.status = status;
    this.code = e?.code;
    this.details = e?.details;
  }
}
export async function api(method, url, body, headers = {}) {
  let res;
  try {
    res = await fetch('/api' + url, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiErr(0, { message: 'Tarmoq xatosi. Internetni tekshiring' });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiErr(res.status, data.error);
  return data;
}

// ---- session + router
export const state = { user: null };
export async function loadUser() {
  state.user = (await api('GET', '/auth/me')).user;
  return state.user;
}

const routes = [];
export const route = (pattern, handler, opts = {}) =>
  routes.push({ re: new RegExp('^' + pattern.replace(/:[a-z]+/gi, '([^/]+)') + '/?$'), handler, ...opts });
let renderToken = 0,
  cleanup = null;
const $main = () => document.getElementById('main');

export function navigate(path, replace = false) {
  history[replace ? 'replaceState' : 'pushState'](null, '', path);
  return renderRoute();
}
export async function renderRoute() {
  const token = ++renderToken;
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  const url = new URL(location.href);
  const main = $main();
  for (const r of routes) {
    const m = r.re.exec(url.pathname);
    if (!m) continue;
    if (r.roles && !(state.user && r.roles.includes(state.user.role))) {
      if (!state.user)
        return navigate('/auth/login?next=' + encodeURIComponent(url.pathname + url.search), true);
      main.innerHTML = String(
        html`<div class="empty"><h2>${t('Ruxsat yo‘q')}</h2><p>${t('Bu sahifa sizning rolingiz uchun emas.')}</p></div>`,
      );
      return;
    }
    main.innerHTML = '<div class="loading" aria-busy="true">…</div>';
    try {
      const out = await r.handler({ params: m.slice(1).map(decodeURIComponent), query: url.searchParams });
      if (token !== renderToken) return;
      main.innerHTML = String(out.html ?? out);
      window.scrollTo(0, 0);
      if (out.mount) cleanup = out.mount(main) || null;
    } catch (e) {
      if (token !== renderToken) return;
      if (e.status === 401)
        return navigate('/auth/login?next=' + encodeURIComponent(url.pathname + url.search), true);
      main.innerHTML = String(
        html`<div class="empty"><h2>${e.status === 404 ? t('Topilmadi') : t('Xatolik')}</h2><p>${e.message}</p><a href="/" data-link class="btn">${t('Bosh sahifa')}</a></div>`,
      );
    }
    updateChrome();
    document.dispatchEvent(new Event('route:rendered'));
    return;
  }
  main.innerHTML = String(
    html`<div class="empty"><h2>404</h2><p>${t('Sahifa topilmadi')}</p><a href="/" data-link class="btn">${t('Bosh sahifa')}</a></div>`,
  );
}

export function updateChrome() {
  const u = state.user,
    p = location.pathname;
  document
    .querySelectorAll('[data-nav]')
    .forEach((a) =>
      a.classList.toggle(
        'active',
        p === a.getAttribute('href') ||
          (a.getAttribute('href') !== '/' && p.startsWith(a.getAttribute('href'))),
      ),
    );
  const acct = document.getElementById('acct');
  if (acct)
    acct.innerHTML = String(
      u
        ? html`${u.role === 'admin' ? html`<a href="/admin" data-link class="btn sm">${t('Admin')}</a>` : ''}${u.role === 'seller' ? html`<a href="/seller" data-link class="btn sm">${t('Sotuvchi')}</a>` : ''}<a href="/profile" data-link class="btn sm ghost">${u.name.split(' ')[0]}</a>`
        : html`<a href="/auth/login" data-link class="btn sm">${t('Kirish')}</a>`,
    );
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target) return;
  e.preventDefault();
  navigate(a.getAttribute('href'));
});
window.addEventListener('popstate', renderRoute);

// ---- ui helpers
export function toast(msg, kind = 'info') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  el.setAttribute('role', 'status');
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), 4500);
}
/** Runs fn on submit/click, disabling the control while pending and toasting errors. */
export async function guarded(btn, fn) {
  if (btn) btn.disabled = true;
  try {
    return await fn();
  } catch (e) {
    toast(e.message, 'bad');
  } finally {
    if (btn) btn.disabled = false;
  }
}
export function tick(fn, ms = 1000) {
  const id = setInterval(fn, ms);
  return () => clearInterval(id);
}
export const formData = (form) => Object.fromEntries(new FormData(form));
export const copyText = async (txt) => {
  try {
    await navigator.clipboard.writeText(txt);
    toast(t('Havola nusxalandi'), 'ok');
  } catch {
    prompt(t('Havolani nusxalang'), txt);
  }
};
