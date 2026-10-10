import { db, nowIso } from './db.js';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const bad = (m, code = 'bad_request', details) => new ApiError(400, code, m, details);
export const unprocessable = (m, code = 'unprocessable', details) => new ApiError(422, code, m, details);
export const forbidden = (m = 'Ruxsat yo‘q') => new ApiError(403, 'forbidden', m);
export const notFound = (m = 'Topilmadi') => new ApiError(404, 'not_found', m);
export const conflict = (m, code = 'conflict') => new ApiError(409, code, m);

export function int(v, name, { min = 0, max = 1_000_000_000_000 } = {}) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) throw bad(`“${name}” qiymati noto‘g‘ri`);
  return n;
}
export function str(v, name, { min = 1, max = 300, optional = false } = {}) {
  if ((v === undefined || v === null || v === '') && optional) return null;
  if (typeof v !== 'string') throw bad(`“${name}” matn bo‘lishi kerak`);
  const s = v.trim();
  if (s.length < min || s.length > max) throw bad(`“${name}” uzunligi ${min}–${max} belgi bo‘lishi kerak`);
  return s;
}
export function oneOf(v, list, name) {
  if (!list.includes(v)) throw bad(`“${name}” noto‘g‘ri`);
  return v;
}
export function audit(actorId, action, entity, entityId, detail) {
  db.prepare('INSERT INTO audit_log(at,actor_id,action,entity,entity_id,detail) VALUES(?,?,?,?,?,?)').run(
    nowIso(),
    actorId ?? null,
    action,
    entity,
    entityId ?? null,
    detail === undefined ? null : JSON.stringify(detail),
  );
}
export function slugify(s) {
  return (
    s
      .toLowerCase()
      .replace(/[ʻʼ'`’‘]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'mahsulot'
  );
}
export function normalizePhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  const n = d.length === 9 ? '998' + d : d;
  if (!/^998\d{9}$/.test(n)) throw bad('Telefon raqami +998XXXXXXXXX ko‘rinishida bo‘lishi kerak');
  return '+' + n;
}
