import { createHash, randomInt } from 'node:crypto';

// Letters and digits that are hard to confuse when read aloud or typed from a screenshot (no 0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

export function generateRoomCode() {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/** The same seed always gives the same code, so every copy of a freshly seeded demo database agrees. */
export function roomCodeFromSeed(seed) {
  const digest = createHash('sha256').update(String(seed)).digest();
  return Array.from({ length: ROOM_CODE_LENGTH }, (_, i) => ALPHABET[digest[i] % ALPHABET.length]).join('');
}

/** Accepts what people type or paste: "k7m-4qx", " K7M4QX ", a full room link. */
export function normalizeRoomCode(input) {
  const raw = String(input ?? '');
  const fromLink = raw.match(/\/room\/([A-Za-z0-9-]+)/);
  return (fromLink ? fromLink[1] : raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
}
