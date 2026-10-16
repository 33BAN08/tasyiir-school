// Cell values of an import file → the app's values. Excel cells come as
// string, number, boolean or Date; CSV cells are always strings.

import { normalizeMobile } from "@/lib/parents/phone";
import type { Relation } from "@/lib/validations/parents";
import type { Gender } from "@/lib/validations/students";

import { normalizeHeader } from "./columns";

export type Cell = string | number | boolean | Date | null | undefined;

/** Text of a cell, trimmed ("" when empty). A whole number stays without ".0". */
export function cellText(value: Cell): string {
  if (value === null || value === undefined || value instanceof Date) return "";
  return String(value).trim();
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;

function isoFromParts(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * Birth date → "yyyy-mm-dd", or null if it is not a real date. Accepts an
 * Excel date cell, an Excel day number (a date cell formatted as a number),
 * "dd/mm/yyyy" (also with "-" or "."), and "yyyy-mm-dd".
 */
export function parseBirthDate(value: Cell): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : isoFromParts(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 1 || value > 80_000) return null;
    return new Date(EXCEL_EPOCH + value * DAY_MS).toISOString().slice(0, 10);
  }
  const text = cellText(value);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (dmy) return isoFromParts(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (ymd) return isoFromParts(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
  return null;
}

const GENDER_WORDS: Record<string, Gender> = Object.fromEntries([
  ...["g", "garcon", "m", "male", "masculin", "homme", "h", "boy", "ذكر", "ذ"].map((w) => [normalizeHeader(w), "male"]),
  ...["f", "fille", "female", "feminin", "femme", "girl", "انثى", "أنثى", "ا"].map((w) => [normalizeHeader(w), "female"]),
]);

/** "G", "Garçon", "M", "ذكر" → male; "F", "Fille", "أنثى" → female; anything else → null. */
export function parseGender(value: Cell): Gender | null {
  return GENDER_WORDS[normalizeHeader(cellText(value))] ?? null;
}

const RELATION_WORDS: Record<string, Relation> = Object.fromEntries([
  ...["pere", "p", "father", "papa", "dad", "اب", "الاب", "أب", "الأب"].map((w) => [normalizeHeader(w), "father"]),
  ...["mere", "m", "mother", "maman", "mom", "ام", "الام", "أم", "الأم"].map((w) => [normalizeHeader(w), "mother"]),
  ...["tuteur", "tutrice", "t", "tutor", "guardian", "ولي", "الولي", "وليالامر"].map((w) => [normalizeHeader(w), "tutor"]),
]);

/** "Père", "father", "أب" → father; "Mère", "أم" → mother; "Tuteur", "ولي" → tutor. */
export function parseRelation(value: Cell): Relation | null {
  return RELATION_WORDS[normalizeHeader(cellText(value))] ?? null;
}

/**
 * Parent phone → "+2126…" or null. Excel often stores 0612345678 as the
 * number 612345678 (the leading 0 is lost): put it back.
 */
export function parsePhone(value: Cell): string | null {
  const text = cellText(value);
  const digits = text.replace(/[\s.\-()]/g, "");
  return normalizeMobile(/^[67]\d{8}$/.test(digits) ? `0${digits}` : text);
}
