import crypto from 'node:crypto';
import { db, nowIso } from './db.js';
import { ApiError, forbidden } from './util.js';

const SESSION_DAYS = 14;

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
export function verifyPassword(pw, stored) {
  const [alg, saltHex, hashHex] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(sha(token), userId, expires);
  return { token, maxAge: SESSION_DAYS * 86400 };
}
export function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(token));
}
function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
export function setSessionCookie(res, token, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.append('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`);
}
export function clearSessionCookie(res) {
  res.append('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
}

export function attachUser(req, _res, next) {
  const token = parseCookies(req.headers.cookie).sid;
  req.sessionToken = token;
  req.user = null;
  if (token) {
    const row = db
      .prepare(
        `SELECT u.id,u.name,u.phone,u.email,u.role,u.status,u.shop_name FROM sessions s JOIN users u ON u.id=s.user_id
         WHERE s.token_hash=? AND s.expires_at>?`,
      )
      .get(sha(token), nowIso());
    if (row && row.status !== 'blocked') req.user = row;
  }
  next();
}
export function requireAuth(req, _res, next) {
  if (!req.user) return next(new ApiError(401, 'unauthorized', 'Avval tizimga kiring'));
  next();
}
export const requireRole = (...roles) => (req, res, next) =>
  requireAuth(req, res, (err) => {
    if (err) return next(err);
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  });

// --- tiny in-memory rate limiter -------------------------------------------------
const buckets = new Map();
const MULT = Number(process.env.RATE_LIMIT_MULTIPLIER) || 1;
export const rateLimit = (name, max, windowMs) => (req, _res, next) => {
  const key = `${name}:${req.user?.id ?? req.ip}`;
  const now = Date.now();
  const arr = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max * MULT) return next(new ApiError(429, 'rate_limited', 'So‘rovlar juda ko‘p. Birozdan so‘ng urinib ko‘ring'));
  arr.push(now);
  buckets.set(key, arr);
  next();
};
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (!v.some((t) => now - t < 120000)) buckets.delete(k);
}, 60000).unref();
