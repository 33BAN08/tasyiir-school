// The dashboard's periods, from the school's "today" (a yyyy-MM-dd date that
// ALWAYS comes from the database clock in Africa/Casablanca, schoolClock(),
// never from the server's or the browser's clock). Pure date arithmetic on
// that string: no time zone is involved after that.
//   today     = today → today
//   week      = Monday of this week → today
//   lastWeek  = the same days one week earlier (Monday → today − 7), so the
//               two weeks compare like for like
//   last30    = today − 29 → today (30 days)

export type DateRange = { from: string; to: string };
export type DashboardRanges = { today: DateRange; week: DateRange; lastWeek: DateRange; last30: DateRange };

const toDate = (iso: string) => new Date(`${iso}T12:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (iso: string, days: number) => {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
};

export function dashboardRanges(today: string): DashboardRanges {
  const weekday = (toDate(today).getUTCDay() + 6) % 7; // Monday = 0 … Sunday = 6
  const monday = addDays(today, -weekday);
  return {
    today: { from: today, to: today },
    week: { from: monday, to: today },
    lastWeek: { from: addDays(monday, -7), to: addDays(today, -7) },
    last30: { from: addDays(today, -29), to: today },
  };
}

/** "08:00" + 15 minutes ≤ "08:20"? (Both school times, HH:MM.) */
export function startedAtLeast(start: string, now: string, minutes: number): boolean {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return m(start) + minutes <= m(now);
}
