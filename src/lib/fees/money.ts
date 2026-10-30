// Amounts of the fees module: integer CENTIMES everywhere (database, actions,
// props), text only at the edges. Plain module (no "use client" / "server-only"):
// the forms parse with it and the server validates with the same rules.

/** Upper bound of one amount (100 000 DH), the database's typo guard. */
export const MAX_CENTIMES = 10_000_000;

// fr-FR groups with spaces (fr-MA uses dots in some ICU builds); see formatPriceDh.
const wholeFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/**
 * Typed amount → centimes. Accepts `1500`, `1 500`, `1500,5`, `1500.50`
 * (spaces / no-break spaces as thousands separators, comma or dot for the
 * decimals, at most 2 decimals). Empty → null; anything else → NaN.
 */
export function parseAmount(text: string): number | null {
  const clean = text.replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
  if (clean === "") return null;
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(clean);
  if (!match) return Number.NaN;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

/**
 * Centimes → `1 250,00 DH` (docs/DESIGN.md: same in every UI language), in
 * invisible left-to-right isolates (LRI … PDI, like ltr() in src/lib/format.ts):
 * inside Arabic text the browser would otherwise show "DH 1 250,00".
 */
export function formatCentimes(centimes: number): string {
  const whole = Math.trunc(centimes / 100);
  const cents = Math.abs(centimes % 100);
  // Integer parts formatted separately: no float rounding on large amounts.
  const text = `${wholeFormat.format(whole)},${String(cents).padStart(2, "0")}`;
  return `\u2066${text.replace(/\s/g, "\u00a0")}\u00a0DH\u2069`;
}

/** Centimes → the text shown in an input: `1500` for whole dirhams, else `1500,50`. */
export function amountInputText(centimes: number | null): string {
  if (centimes === null) return "";
  const whole = Math.trunc(centimes / 100);
  const cents = centimes % 100;
  return cents === 0 ? String(whole) : `${whole},${String(cents).padStart(2, "0")}`;
}

/**
 * Typed percent → basis points (1 % = 100). Accepts `10`, `12,5`, `12.75`
 * (at most 2 decimals). Empty → null; anything else → NaN.
 */
export function parsePercent(text: string): number | null {
  const clean = text.replace(/[\s%]/g, "").replace(",", ".");
  if (clean === "") return null;
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(clean);
  if (!match) return Number.NaN;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

/** Basis points → `12,5 %` (no trailing zeros), isolated like formatCentimes. */
export function formatPercent(bp: number): string {
  const text = (bp / 100).toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
  return `\u2066${text}\u00a0%\u2069`;
}

/** Basis points → input text: `12,5`. */
export function percentInputText(bp: number | null): string {
  return bp === null ? "" : (bp / 100).toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
}
