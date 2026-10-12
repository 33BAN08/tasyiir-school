/** Calendar helpers for Africa/Casablanca (store UTC, think in Moroccan days). */

export const TIME_ZONE = "Africa/Casablanca";

const isoDateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE });

/** Calendar date in Casablanca of an instant, as `yyyy-MM-dd`. */
export function dateInCasablanca(at: Date | string): string {
  return isoDateFormat.format(new Date(at));
}

/** Today's date in Casablanca as `yyyy-MM-dd`. */
export function todayInCasablanca(): string {
  return dateInCasablanca(new Date());
}

const offsetFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  timeZoneName: "longOffset",
});

/** Casablanca's UTC offset in minutes at an instant (+60 most of the year, 0 during Ramadan). */
function offsetMinutes(at: Date): number {
  const name = offsetFormat.formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "";
  const m = name.match(/GMT([+-])(\d{2}):(\d{2})/);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

/** `yyyy-MM-dd` → UTC ISO timestamp of 23:59:59 that day in Casablanca. */
export function endOfDayInCasablanca(date: string): string {
  const asUtc = new Date(`${date}T23:59:59Z`);
  return new Date(asUtc.getTime() - offsetMinutes(asUtc) * 60_000).toISOString();
}

/** `yyyy-MM-dd` + n days (calendar arithmetic, no time zone involved). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
