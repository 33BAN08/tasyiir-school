/** Unambiguous characters only (no 0/O, 1/l/I): easy to read out or type from paper. */
const LETTERS = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const ALL = LETTERS + DIGITS;

function pick(chars: string, random: number): string {
  return chars[random % chars.length]!;
}

/** Random temporary password (Web Crypto) with at least one letter and one digit. */
export function generateTemporaryPassword(length = 14): string {
  const random = crypto.getRandomValues(new Uint32Array(length));
  const chars = Array.from(random, (r) => pick(ALL, r));
  chars[0] = pick(LETTERS, random[0]!);
  chars[length - 1] = pick(DIGITS, random[length - 1]!);
  return chars.join("");
}
