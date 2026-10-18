// Periods for attendance totals (client + server): calendar arithmetic on
// "yyyy-MM-dd" dates only, from the school's today (given by the database).

export const PERIODS = ["week", "month", "year"] as const;
export type Period = (typeof PERIODS)[number];

const DAY = 86_400_000;
const parse = (date: string) => Date.parse(`${date}T00:00:00Z`);
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);

/**
 * From–to (inclusive) of a period ending today, kept inside the school year:
 * week = since Monday, month = since the 1st, year = since the year's start.
 * A past year runs to its end.
 */
export function periodRange(period: Period, today: string, year: { startDate: string; endDate: string }): { from: string; to: string } {
  const to = today < year.endDate ? today : year.endDate;
  let from = year.startDate;
  if (period === "week") {
    const weekday = (new Date(parse(to)).getUTCDay() + 6) % 7; // Monday 0
    from = iso(parse(to) - weekday * DAY);
  } else if (period === "month") {
    from = `${to.slice(0, 7)}-01`;
  }
  return { from: from < year.startDate ? year.startDate : from, to };
}
