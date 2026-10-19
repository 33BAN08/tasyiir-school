import { TIME_ZONE } from "@/lib/dates";

/**
 * Display formats from docs/DESIGN.md, identical in every UI language:
 * amounts `1 250,00 DH`, dates `dd/MM/yyyy` in Africa/Casablanca.
 */

const amountFormat = new Intl.NumberFormat("fr-MA", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** `1250` → `1 250,00 DH`. */
export function formatMoney(amount: number): string {
  return `${amountFormat.format(amount)} DH`;
}

/** UTC timestamp or `yyyy-MM-dd` date → `dd/MM/yyyy` (Casablanca time). */
export function formatDate(value: string | Date): string {
  // A bare date has no time zone: read it as noon UTC so it never shifts a day.
  const date =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T12:00:00Z`)
      : new Date(value);
  return dateFormat.format(date);
}

const dateTimeFormat = new Intl.DateTimeFormat("fr-FR", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** UTC timestamp → `dd/MM/yyyy HH:mm` (Casablanca time). */
export function formatDateTime(value: string | Date): string {
  return dateTimeFormat.format(new Date(value)).replace(",", "");
}

/** `2026-10` → "octobre 2026" / "أكتوبر 2026" / "October 2026" (UI language, Latin digits). */
export function formatMonth(month: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-MA" : locale, {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
    numberingSystem: "latn",
  }).format(new Date(`${month}-15T12:00:00Z`));
}

/**
 * Keeps a left-to-right value (year "2026-2027", time range "08:00–09:00")
 * in order inside an Arabic sentence. Without it the browser treats digits
 * after Arabic letters as Arabic numbers and shows "2027-2026". Wraps the
 * value in invisible Unicode isolates (LRI … PDI).
 */
export function ltr(value: string): string {
  return `\u2066${value}\u2069`;
}

/**
 * A name of unknown direction (a teacher, a class "1AC-A", a room) put into a
 * sentence: it keeps its own direction and does not reorder the words around
 * it. Unicode first-strong isolate (FSI \u2026 PDI).
 */
export function isolate(value: string): string {
  return `\u2068${value}\u2069`;
}
