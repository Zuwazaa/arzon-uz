import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { WIKI, WIKI_BASE } from './product-images.js';

const dir = path.join(process.cwd(), 'public', 'img', 'p');
fs.mkdirSync(dir, { recursive: true });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, skipped = 0, failed = [];

for (const [key, p] of Object.entries(WIKI)) {
  const out = path.join(dir, `${key}.jpg`);
  if (fs.existsSync(out)) { skipped++; continue; }
  let done = false;
  for (let i = 0; i < 8 && !done; i++) {
    const res = await fetch(WIKI_BASE + p, { headers: { 'User-Agent': UA } });
    if (res.status === 429) { await sleep(6000 * (i + 1)); continue; }
    if (!res.ok) { console.log('xato', res.status, key); break; }
    await sharp(Buffer.from(await res.arrayBuffer())).rotate().resize({ width: 720, withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toFile(out);
    ok++; done = true; console.log('yuklandi', key);
  }
  if (!done) failed.push(key);
  await sleep(2500);
}
console.log(`Tayyor: ${ok} yangi, ${skipped} oldindan bor, ${failed.length} xato`, failed.join(', '));
