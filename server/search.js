// Search: normalisation (apostrophes, Cyrillic), synonyms, typo tolerance and relevance ranking.
const CYR = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
};

export const norm = (s) => String(s || '').toLowerCase()
  .replace(/[а-яёўқғҳ]/g, (c) => CYR[c] ?? c)
  .replace(/[‘’ʻʼ`´']/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();
const words = (s) => norm(s).split(' ').filter(Boolean);

const SYN = [
  'shakar qand saxar sugar', 'guruch ris', 'un muka', 'yog moy maslo', 'choy chay', 'tuz sol', 'kofe kofye', 'daftar tetrad', 'ruchka', 'qalam karandash',
  'konfet konfeta shirinlik', 'pechenye pechene pechenie', 'non lepyoshka lepeshka patir', 'tort pirog', 'sut moloko', 'asol asal med', 'yongoq gres orex',
  'mayiz izyum', 'orik kuraga', 'nuxat', 'makaron pasta', 'grechka grecha', 'sovun mylo', 'sharlar sharik shar', 'bitiruv vypusk', 'toy tuy svadba', 'ryukzak ryukzagi sumka rukzak',
  'konserva konservalar', 'suv su voda water', 'sharbat sok juice', 'ichimlik ichimliklar napitok', 'limonad gazlangan gazirovka', 'stakan stakanlar', 'salfetka salfetkalar',
].map((g) => g.split(' '));
const synOf = new Map();
for (const g of SYN) for (const w of g) synOf.set(w, g);
const expand = (tok) => {
  const set = new Set([tok]);
  for (const w of synOf.get(tok) || []) set.add(w);
  for (const [k, g] of synOf) if (k.length > 3 && tok.length >= 3 && k.startsWith(tok)) g.forEach((w) => set.add(w));
  return [...set];
};

function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Score of one query alternative against a list of field words: [quality, matchedWord, fuzzy]. */
function matchWord(tok, ws, strict) {
  let best = [0, null, false];
  const typo = strict ? 0 : tok.length >= 9 ? 2 : tok.length >= 5 ? 1 : 0;
  for (const w of ws) {
    let q = 0, fuzzy = false;
    if (w === tok) q = 1;
    else if (w.startsWith(tok) && !(strict && tok.length < 5)) q = 0.9;
    else if (!strict && tok.length >= 4 && w.includes(tok)) q = 0.6;
    else if (typo && lev(tok, w.length > tok.length ? w.slice(0, tok.length + 1) : w, typo) <= typo) { q = 0.5; fuzzy = true; }
    if (q > best[0]) best = [q, w, fuzzy];
  }
  return best;
}

const FIELDS = [['title', 10], ['category', 6], ['seller', 3], ['description', 2]];

/** rows: product rows (title, description, category_name, seller_name, stock_qty, min_individual_qty, id). */
export function rankProducts(rows, query) {
  const toks = words(query);
  if (!toks.length) return { scores: null, didYouMean: null };
  const scores = new Map();
  const fuzzyHits = new Map();
  for (const p of rows) {
    const idx = {
      title: words(p.title), category: words(p.category_name), seller: words(p.seller_name), description: words(p.description),
    };
    let total = 0, ok = true;
    const fz = [];
    for (const tok of toks) {
      let tokBest = 0, tokWord = null, tokFuzzy = false;
      for (const alt of expand(tok)) {
        for (const [f, wgt] of FIELDS) {
          const [q, w, fuzzy] = matchWord(alt, idx[f], alt !== tok);
          const sc = q * wgt * (alt === tok ? 1 : 0.8);
          if (sc > tokBest) { tokBest = sc; tokWord = w; tokFuzzy = fuzzy; }
        }
      }
      if (!tokBest) { ok = false; break; }
      total += tokBest;
      if (tokFuzzy) fz.push([tok, tokWord]);
    }
    if (!ok) continue;
    const title = norm(p.title), qn = toks.join(' ');
    if (title.startsWith(qn)) total += 8; else if (title.includes(qn)) total += 4;
    if (p.stock_qty >= p.min_individual_qty) total += 1;
    scores.set(p.id, total);
    if (fz.length) fuzzyHits.set(p.id, fz);
  }
  let didYouMean = null;
  const exact = [...scores.keys()].some((id) => !fuzzyHits.has(id));
  if (scores.size && !exact) {
    const top = [...scores.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const map = new Map(fuzzyHits.get(top));
    didYouMean = toks.map((t) => map.get(t) || t).join(' ');
  }
  return { scores, didYouMean };
}

export const POPULAR = ['Guruch', 'Shakar', 'Yog‘', 'Choy', 'Un', 'Daftar', 'Konfet', 'Ryukzak'];

export function matchCategories(cats, query) {
  const toks = words(query);
  if (!toks.length) return [];
  return cats.filter((c) => { const ws = words(c.name); return toks.every((t) => ws.some((w) => w.startsWith(t) || (t.length >= 3 && w.includes(t)))); }).slice(0, 3);
}
