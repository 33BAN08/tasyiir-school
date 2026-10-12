/**
 * Display formats from docs/DESIGN.md, identical in every UI language:
 * amounts `1 250,00 DH`, dates `dd/MM/yyyy` in Africa/Casablanca.
 */

const TIME_ZONE = "Africa/Casablanca";

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
