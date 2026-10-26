// Unit checks of src/lib/dashboard/ranges.ts: the dashboard's periods from the
// school's "today" (which itself always comes from the database clock in
// Africa/Casablanca: see the midnight checks in dashboard-aggregates.mjs).
import { check } from "./checks.mjs";

const { dashboardRanges, startedAtLeast, addDays } = await import("../../src/lib/dashboard/ranges.ts");

const same = (name, got, want) => check(`[dashboard ranges] ${name}`, JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got));

// Monday 2026-10-26: the week is that day alone, last week = the Monday before.
same("Monday: week = today, last week = last Monday, 30 days back",
  dashboardRanges("2026-10-26"),
  { today: { from: "2026-10-26", to: "2026-10-26" }, week: { from: "2026-10-26", to: "2026-10-26" },
    lastWeek: { from: "2026-10-19", to: "2026-10-19" }, last30: { from: "2026-09-27", to: "2026-10-26" } });
// Sunday 2026-11-01: still the week that started on Monday 26 October (crosses the month).
same("Sunday: the week started on Monday (across the month end)",
  dashboardRanges("2026-11-01").week, { from: "2026-10-26", to: "2026-11-01" });
same("…last week = Monday → Sunday a week earlier", dashboardRanges("2026-11-01").lastWeek, { from: "2026-10-19", to: "2026-10-25" });
// Friday 1 January 2027: the week and the 30 days cross the year.
same("1 January (Friday): week from Monday 28 December", dashboardRanges("2027-01-01").week, { from: "2026-12-28", to: "2027-01-01" });
same("…30 days from 3 December", dashboardRanges("2027-01-01").last30, { from: "2026-12-03", to: "2027-01-01" });
// 1 March 2028 (leap year): yesterday is 29 February.
same("leap year: 1 March − 1 day = 29 February", addDays("2028-03-01", -1), "2028-02-29");
// Roll call grace: a lesson counts as waiting 15 minutes after its start, not before.
check("[dashboard ranges] 08:00 + 15 min ≤ 08:15: waiting", startedAtLeast("08:00", "08:15", 15));
check("[dashboard ranges] 08:00 + 15 min > 08:14: not yet", !startedAtLeast("08:00", "08:14", 15));
check("[dashboard ranges] 23:50 + 15 min never reaches a time of the same day", !startedAtLeast("23:50", "23:59", 15));
