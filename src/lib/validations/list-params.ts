import { z } from "zod";

// Building blocks for list URL queries (?q=&status=&page=).
// Invalid values fall back to defaults, never error: a bad URL still renders.

/** First value of a query param (`?a=1&a=2` → "1"). */
export const firstParam = z.preprocess((v) => (Array.isArray(v) ? v[0] : v), z.string().optional());

/** Free-text search, trimmed, at most 100 characters ("" = none). */
export const searchParam = firstParam.transform((v) => v?.trim().slice(0, 100) ?? "");

/** 1-based page number (1 when missing or invalid). */
export const pageParam = firstParam.transform((v) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
});

/** One of `values`, or undefined. */
export function enumParam<const T extends readonly string[]>(values: T) {
  return firstParam.transform((v) => (values.includes(v as T[number]) ? (v as T[number]) : undefined));
}

/** A UUID, or undefined. */
export const uuidParam = firstParam.transform((v) => (z.uuid().safeParse(v).success ? v : undefined));
