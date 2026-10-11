import { randomInt } from 'node:crypto';

// Letters and digits that are hard to confuse when read aloud or typed from a screenshot (no 0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

export function generateRoomCode() {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/** Accepts what people type or paste: "k7m-4qx", " K7M4QX ", a full room link. */
export function normalizeRoomCode(input) {
  const raw = String(input ?? '');
  const fromLink = raw.match(/\/room\/([A-Za-z0-9-]+)/);
  return (fromLink ? fromLink[1] : raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
}
