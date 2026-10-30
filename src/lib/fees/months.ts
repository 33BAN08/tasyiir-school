// Months of an academic year for the fees screens (`yyyy-MM-01`). Plain
// module: used by server pages and client forms.

/** Every month that overlaps the year, in order. */
export function yearMonths(startDate: string, endDate: string): string[] {
  const months: string[] = [];
  let [y, m] = startDate.slice(0, 7).split("-").map(Number);
  const last = endDate.slice(0, 7);
  for (;;) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (key > last) break;
    months.push(`${key}-01`);
    m += 1;
    if (m === 13) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

/** `2026-09-01` → `sept. 2026` / `sept. 2026` (ar: Western digits, as everywhere else). */
export function shortMonth(month: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-MA" : locale, {
    timeZone: "UTC",
    month: "short",
    year: "numeric",
    numberingSystem: "latn",
  }).format(new Date(`${month.slice(0, 7)}-15T12:00:00Z`));
}
