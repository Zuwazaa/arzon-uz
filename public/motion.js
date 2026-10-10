const M = window.Motion;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (M && !reduce) {
  const { animate, inView } = M;
  let stops = [];
  const clear = (anim, el) => anim.finished.then(() => { el.style.removeProperty('opacity'); el.style.removeProperty('transform'); }).catch(() => {});
  const pop = { type: 'spring', stiffness: 240, damping: 14 };

  document.addEventListener('route:rendered', () => {
    stops.forEach((s) => s());
    stops = [];
    const main = document.getElementById('main');
    try {
      const hero = [...main.querySelectorAll('.hero2 > div:first-child > *')];
      hero.forEach((el) => { el.style.opacity = '0'; });
      if (hero.length) clear(animate(hero, { opacity: [0, 1], y: [22, 0] }, { duration: 0.5, delay: M.stagger(0.07), ease: 'easeOut' }), hero[0]);
      hero.slice(1).forEach((el) => setTimeout(() => el.style.removeProperty('opacity'), 1400));
      setTimeout(() => hero[0] && hero[0].style.removeProperty('opacity'), 1400);

      const pieces = [...main.querySelectorAll('.frame, .sticker, .deal')];
      pieces.forEach((el, i) => {
        el.style.opacity = '0';
        const a = animate(el, { opacity: [0, 1], scale: [0.6, 1], y: [40, 0] }, { ...pop, delay: 0.25 + i * 0.12 });
        clear(a, el);
      });
      main.querySelectorAll('[data-count]').forEach((el) => {
        const to = Number(el.dataset.count);
        animate(0, to, { duration: 1.4, delay: 0.7, ease: 'easeOut', onUpdate: (v) => { el.textContent = Math.round(v); } });
      });

      const items = [...main.querySelectorAll('.grid > *, .cats > *, .how li, .stats > *, .detail > *, .checkout > *, .section-head, .cta')];
      items.forEach((el) => { el.style.opacity = '0'; });
      const seen = new Map();
      items.forEach((el) => {
        const i = seen.get(el.parentElement) || 0;
        seen.set(el.parentElement, i + 1);
        stops.push(inView(el, () => clear(animate(el, { opacity: [0, 1], y: [28, 0] }, { type: 'spring', stiffness: 170, damping: 20, delay: Math.min(i, 7) * 0.05 }), el), { margin: '0px 0px -6% 0px' }));
      });
      main.querySelectorAll('.bar i').forEach((bar) => {
        const target = bar.style.width || '0%';
        bar.style.width = '0%';
        stops.push(inView(bar, () => { animate(bar, { width: ['0%', target] }, { duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 }).finished.then(() => { bar.style.width = target; }).catch(() => {}); }));
      });
    } catch (e) { main.querySelectorAll('[style*="opacity"]').forEach((el) => el.style.removeProperty('opacity')); }
  });

  document.addEventListener('pointerover', (e) => {
    const f = e.target.closest('.frame');
    if (f && !f.contains(e.relatedTarget)) animate(f, { scale: 1.06 }, { type: 'spring', stiffness: 300, damping: 16 });
    const s = e.target.closest('.sticker');
    if (s && !s.contains(e.relatedTarget)) animate(s, { rotate: [0, 18, -8, 0] }, { duration: 0.6 });
  });
  document.addEventListener('pointerout', (e) => {
    const f = e.target.closest('.frame');
    if (f && !f.contains(e.relatedTarget)) animate(f, { scale: 1 }, { type: 'spring', stiffness: 300, damping: 16 });
  });

  new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach((n) => {
    if (n.nodeType === 1) animate(n, { opacity: [0, 1], x: [60, 0], scale: [0.9, 1] }, { type: 'spring', stiffness: 360, damping: 24 });
  }))).observe(document.getElementById('toasts'), { childList: true });
}
