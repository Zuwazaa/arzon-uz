import { navigate, money } from './core.js';

const form = document.getElementById('hsearch');
const input = form.q;
const box = document.getElementById('sbox');
const clearBtn = form.querySelector('.sclear');
const RK = 'arzon.recent';
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const recent = () => { try { return JSON.parse(localStorage.getItem(RK)) || []; } catch { return []; } };
const setRecent = (list) => { try { localStorage.setItem(RK, JSON.stringify(list.slice(0, 6))); } catch { /* storage unavailable */ } };
const addRecent = (q) => setRecent([q, ...recent().filter((x) => x.toLowerCase() !== q.toLowerCase())]);

const hl = (text, q) => {
  const toks = q.split(/\s+/).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter(Boolean);
  if (!toks.length) return esc(text);
  return text.split(new RegExp(`(${toks.join('|')})`, 'ig')).map((part, i) => (i % 2 ? `<b>${esc(part)}</b>` : esc(part))).join('');
};

let active = -1, ctrl = null, timer = null, seq = 0;
const opts = () => [...box.querySelectorAll('.sopt')];
const open = (htmlStr) => { box.innerHTML = htmlStr; box.hidden = false; input.setAttribute('aria-expanded', 'true'); setActive(-1); };
const close = () => { box.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
function setActive(i) {
  const list = opts();
  list.forEach((el, k) => { el.classList.toggle('on', k === i); el.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
  active = i;
  if (i >= 0 && list[i]) { input.setAttribute('aria-activedescendant', list[i].id); list[i].scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant');
}
const mark = (htmlStr) => { let n = 0; return htmlStr.replace(/class="(sopt(?: [^"]*)?)"/g, (_, c) => `class="${c}" id="so-${n++}" role="option" aria-selected="false"`); };

function idleView() {
  const rec = recent();
  const popular = ['Guruch', 'Shakar', 'Yog‘', 'Choy', 'Un', 'Daftar', 'Konfet', 'Ryukzak'];
  open(mark(`
    ${rec.length ? `<div class="shead"><span>So‘nggi qidiruvlar</span><button type="button" class="slink" data-clear-recent>Tozalash</button></div>
      ${rec.map((q) => `<a class="sopt srow" data-q="${esc(q)}"><span class="sic">↺</span><span class="stext">${esc(q)}</span><button type="button" class="sdel" data-del="${esc(q)}" aria-label="O‘chirish">×</button></a>`).join('')}` : ''}
    <div class="shead"><span>Mashhur so‘rovlar</span></div>
    <div class="schips">${popular.map((q) => `<a class="sopt schip" data-q="${esc(q)}">${esc(q)}</a>`).join('')}</div>`));
}

function resultView(d, q) {
  const parts = [];
  if (d.didYouMean) parts.push(`<div class="sdym">Balki: <a class="sopt" data-q="${esc(d.didYouMean)}"><b>${esc(d.didYouMean)}</b></a>?</div>`);
  if (d.categories.length) parts.push(`<div class="shead"><span>Bo‘limlar</span></div>${d.categories.map((c) => `<a class="sopt srow" data-go="/products?category=${c.id}"><span class="sic">▦</span><span class="stext">${hl(c.name, q)}</span><span class="smeta">Bo‘lim</span></a>`).join('')}`);
  if (d.products.length) {
    parts.push(`<div class="shead"><span>Mahsulotlar</span></div>${d.products.map((p) => `
      <a class="sopt sprod" data-go="/products/${esc(p.slug)}">
        <span class="sthumb">${p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="" loading="lazy">` : esc(p.emoji || '')}</span>
        <span class="sinfo"><span class="stitle">${hl(p.title, q)}</span><span class="smeta">${esc(p.categoryName)}</span></span>
        <span class="sprice"><b>${money(p.entryPrice)}</b><small>/ ${esc(p.unit)}</small>${p.savingsPct ? `<em>−${p.savingsPct}%</em>` : ''}</span>
      </a>`).join('')}
      <a class="sopt sall" data-q="${esc(q)}">«${esc(q)}» bo‘yicha barcha natijalar (${d.total}) →</a>`);
  } else if (!d.categories.length) {
    parts.push(`<div class="sempty"><b>«${esc(q)}» topilmadi</b><span>Imloni tekshiring yoki boshqa so‘z yozing.</span></div>
      <div class="schips">${['Guruch', 'Shakar', 'Yog‘', 'Choy', 'Daftar'].map((x) => `<a class="sopt schip" data-q="${x}">${x}</a>`).join('')}</div>`);
  }
  open(mark(parts.join('')));
}

async function suggest() {
  const q = input.value.trim();
  clearBtn.hidden = !input.value;
  if (!q) return idleView();
  if (ctrl) ctrl.abort();
  ctrl = new AbortController();
  const my = ++seq;
  try {
    const res = await fetch('/api/search/suggest?q=' + encodeURIComponent(q), { signal: ctrl.signal });
    if (!res.ok) return;
    const d = await res.json();
    if (my === seq && document.activeElement === input) resultView(d, q);
  } catch { /* aborted or offline */ }
}

function go(q) {
  q = q.trim();
  close();
  input.blur();
  if (q) { addRecent(q); input.value = q; }
  clearBtn.hidden = !input.value;
  navigate('/products' + (q ? '?q=' + encodeURIComponent(q) : ''));
}

function choose(el) {
  if (!el) return;
  if (el.dataset.go) { const typed = input.value.trim(); if (typed) addRecent(typed); close(); input.blur(); navigate(el.dataset.go); return; }
  if (el.dataset.q) go(el.dataset.q);
}

input.addEventListener('focus', () => (input.value.trim() ? suggest() : idleView()));
input.addEventListener('input', () => { clearBtn.hidden = !input.value; clearTimeout(timer); timer = setTimeout(suggest, 130); });
input.addEventListener('keydown', (e) => {
  const list = opts();
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (box.hidden) { suggest(); return; }
    e.preventDefault();
    if (!list.length) return;
    setActive(e.key === 'ArrowDown' ? (active + 1) % list.length : (active <= 0 ? list.length - 1 : active - 1));
  } else if (e.key === 'Enter' && active >= 0) {
    e.preventDefault();
    choose(list[active]);
  } else if (e.key === 'Escape') {
    if (!box.hidden) close(); else if (input.value) { input.value = ''; clearBtn.hidden = true; } else input.blur();
  }
});
form.addEventListener('submit', (e) => { e.preventDefault(); go(input.value); });
clearBtn.addEventListener('click', () => { input.value = ''; clearBtn.hidden = true; input.focus(); idleView(); });

box.addEventListener('mousedown', (e) => e.preventDefault());
box.addEventListener('click', (e) => {
  const del = e.target.closest('[data-del]');
  if (del) { e.preventDefault(); e.stopPropagation(); setRecent(recent().filter((x) => x !== del.dataset.del)); idleView(); return; }
  if (e.target.closest('[data-clear-recent]')) { setRecent([]); idleView(); return; }
  choose(e.target.closest('.sopt'));
});
document.addEventListener('pointerdown', (e) => { if (!form.contains(e.target)) close(); });
document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
  if ((e.key === '/' && !typing && !e.ctrlKey && !e.metaKey) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); input.focus(); input.select(); }
});
document.addEventListener('route:rendered', () => {
  const q = location.pathname === '/products' ? new URLSearchParams(location.search).get('q') || '' : '';
  if (document.activeElement !== input) input.value = q;
  clearBtn.hidden = !input.value;
  close();
});
