import { Check, Clock, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { formatDate, ltr } from "@/lib/format";
import { cn } from "@/lib/utils";

import { AppBar, Initials } from "./phone-frame";
import { DEMO_DAY } from "./showcase-data";

// Drawn copies of the teacher's roll call (/attendance/[lesson]) and the staff
// totals (/absences?view=totals): same texts, layout and status colours.

const ROLL_CALL = [
  { student: "youssef", status: "present" },
  { student: "salma", status: "absent" },
  { student: "adam", status: "late", minutes: 10 },
  { student: "imane", status: "present" },
  { student: "hiba", status: "present" },
] as const;

const STATUS = {
  present: { row: "border-lp-line bg-lp-surface", badge: "text-lp-app-success", Icon: Check },
  absent: { row: "border-lp-app-danger bg-lp-app-danger/10", badge: "text-lp-app-danger", Icon: X },
  late: { row: "border-lp-app-warning bg-lp-app-warning/10", badge: "text-lp-app-warning", Icon: Clock },
} as const;

export function RollCallScreen() {
  const t = useTranslations("attendance.rollCall");
  const tl = useTranslations("landing");
  const absent = ROLL_CALL.filter((r) => r.status === "absent").length;
  const late = ROLL_CALL.filter((r) => r.status === "late").length;

  return (
    <>
      <AppBar school={tl("showcase.school")} />
      <div className="flex flex-1 flex-col gap-3 overflow-hidden p-3">
        <div>
          <p className="flex items-center gap-1.5 text-base font-semibold">
            <span className="size-2.5 rounded-full bg-lp-brand" />
            {tl("hero.timetable.arabic")}
            <span className="text-lp-muted">·</span>
            <bdi>3AC-B</bdi>
          </p>
          <p className="text-xs text-lp-muted">{ltr("08:00–09:00")}</p>
        </div>
        <p className="text-xs text-lp-muted">{t("notTaken")}</p>
        <ul className="flex flex-col gap-1.5">
          {ROLL_CALL.map((row) => {
            const { row: tone, badge, Icon } = STATUS[row.status];
            const name = tl(`hero.students.${row.student}`);
            return (
              <li key={row.student} className="flex items-stretch gap-1.5">
                <span className={cn("flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-lg border px-2", tone)}>
                  <Initials name={name} className="size-8" />
                  <bdi className="line-clamp-2 min-w-0 flex-1 text-sm leading-tight font-medium break-words">{name}</bdi>
                  <span className={cn("flex shrink-0 items-center gap-0.5 text-xs font-medium", badge)}>
                    <Icon className="size-4" />
                    {t(`status.${row.status}`)}
                  </span>
                </span>
                {row.status === "late" && (
                  <span dir="ltr" className="flex w-10 items-center justify-center rounded-lg border border-lp-line bg-lp-surface text-sm">
                    {row.minutes}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <div className="mt-auto -mx-3 flex flex-col gap-2 border-t border-lp-line bg-lp-bg px-3 pt-2">
          <p className="text-center text-xs font-medium">
            {t("counts", { present: ROLL_CALL.length - absent - late, absent, late })}
          </p>
          <span className="flex min-h-10 items-center justify-center rounded-lg bg-lp-brand text-sm font-semibold text-lp-on-brand">
            {t("save")}
          </span>
        </div>
      </div>
    </>
  );
}

const TOTALS = [
  { student: "salma", absences: 6, minutes: 540, lates: 0, lateMinutes: 0 },
  { student: "adam", absences: 4, minutes: 330, lates: 3, lateMinutes: 25 },
  { student: "imane", absences: 2, minutes: 120, lates: 1, lateMinutes: 10 },
  { student: "youssef", absences: 0, minutes: 0, lates: 0, lateMinutes: 0 },
] as const;

const duration = (minutes: number) => ({
  hasMinutes: minutes % 60 ? "yes" : "no",
  hours: Math.floor(minutes / 60),
  minutes: minutes % 60,
});

export function TotalsScreen() {
  const t = useTranslations("absences");
  const tt = useTranslations("timetable");
  const tl = useTranslations("landing");

  return (
    <>
      <AppBar school={tl("showcase.school")} />
      <div className="flex flex-1 flex-col gap-3 overflow-hidden p-3">
        <p className="text-base font-semibold">{t("title")}</p>
        <div className="inline-flex self-start rounded-lg bg-lp-tint p-0.5 text-[0.6875rem] font-medium text-lp-muted">
          {(["day", "totals", "justifications"] as const).map((view) => (
            <span key={view} className={cn("rounded-md px-2 py-1", view === "totals" && "bg-lp-surface text-lp-ink shadow-sm")}>
              {t(`views.${view}`)}
            </span>
          ))}
        </div>
        <span className="flex h-8 items-center justify-between rounded-md border border-lp-line bg-lp-surface px-2 text-xs">
          <bdi>3AC-B</bdi>
          <span className="text-lp-muted">▾</span>
        </span>
        <div className="flex flex-col gap-1">
          <span className="self-start rounded-md bg-lp-surface px-2 py-1 text-[0.6875rem] font-medium shadow-sm">
            {t("totals.periods.month")}
          </span>
          <span className="text-[0.6875rem] text-lp-muted">
            {t("totals.range", { from: ltr("01/10/2026"), to: ltr(formatDate(DEMO_DAY)) })}
          </span>
        </div>
        <table className="w-full rounded-lg border border-lp-line bg-lp-surface text-[0.6875rem]">
          <thead>
            <tr className="border-b border-lp-line text-lp-muted">
              <th className="px-2 py-1.5 text-start font-medium">{t("totals.student")}</th>
              <th className="px-2 py-1.5 text-start font-medium">{t("totals.absences")}</th>
              <th className="px-2 py-1.5 text-start font-medium">{t("totals.lates")}</th>
            </tr>
          </thead>
          <tbody>
            {TOTALS.map((row) => {
              const none = row.absences === 0 && row.lates === 0;
              return (
                <tr key={row.student} className={cn("border-b border-lp-line last:border-0", none && "text-lp-muted")}>
                  <td className="px-2 py-1.5 font-medium">
                    <bdi>{tl(`hero.students.${row.student}`)}</bdi>
                  </td>
                  <td className={cn("px-2 py-1.5 tabular-nums", row.absences > 0 && "font-medium text-lp-app-danger")}>
                    {row.absences > 0
                      ? t("totals.absenceValue", { count: row.absences, duration: tt("duration", duration(row.minutes)) })
                      : "—"}
                  </td>
                  <td className={cn("px-2 py-1.5 tabular-nums", row.lates > 0 && "font-medium text-lp-app-warning")}>
                    {row.lates > 0 ? t("totals.lateValueMinutes", { count: row.lates, minutes: row.lateMinutes }) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
