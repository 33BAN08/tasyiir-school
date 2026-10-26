import { Clock, X } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { schoolClock } from "@/lib/attendance/clock";
import { getStudentAttendance } from "@/lib/attendance/history";
import { periodRange } from "@/lib/attendance/periods";
import { yearOf } from "@/lib/attendance/staff";
import { ltr } from "@/lib/format";
import { listAcademicYears } from "@/lib/structure/academic-years";
import { SUBJECT_SWATCH } from "@/lib/structure/subject-template";
import { durationParts } from "@/lib/timetable/hours";
import { cn } from "@/lib/utils";

type Props = { schoolId: string; studentId: string };

const RECENT = 10;

/**
 * Staff (attendance.view): a student's absences and late arrivals this school
 * year (the year of the school's today, else the most recent) — totals, then
 * the latest ones, each opening that class's day.
 */
export async function StudentAttendanceCard({ schoolId, studentId }: Props) {
  const [t, tTimetable, clock, years] = await Promise.all([
    getTranslations("absences.student"),
    getTranslations("timetable"),
    schoolClock(),
    listAcademicYears(schoolId),
  ]);
  const year = yearOf(years, clock.date) ?? years[0];
  if (!year) return null;
  const { from, to } = periodRange("year", clock.date, year);
  const { totals, marks } = await getStudentAttendance(schoolId, studentId, from, to);
  const dmy = (date: string) => {
    const [y, m, d] = date.split("-");
    return ltr(`${d}/${m}/${y}`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title", { year: ltr(year.label) })}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border p-3">
            <dt className="text-sm text-muted-foreground">{t("absences")}</dt>
            <dd className={cn("text-lg font-semibold tabular-nums", totals.absences > 0 && "text-danger")} data-student-absences={totals.absences}>
              {totals.absences > 0
                ? t("absenceValue", { count: totals.absences, duration: tTimetable("duration", durationParts(totals.absentMinutes)) })
                : t("none")}
            </dd>
          </div>
          <div className="rounded-lg border p-3">
            <dt className="text-sm text-muted-foreground">{t("lates")}</dt>
            <dd className={cn("text-lg font-semibold tabular-nums", totals.lates > 0 && "text-warning")}>
              {totals.lates > 0 ? t(totals.lateMinutes > 0 ? "lateValueMinutes" : "lateValue", { count: totals.lates, minutes: totals.lateMinutes }) : t("none")}
            </dd>
          </div>
        </dl>
        {marks.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">{t("recent")}</h3>
            <ul className="flex flex-col gap-1.5">
              {marks.slice(0, RECENT).map((m) => (
                <li key={`${m.date}-${m.start}`}>
                  <Link
                    href={`/absences?view=day&date=${m.date}&class=${m.classId}`}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="tabular-nums text-muted-foreground">{dmy(m.date)}</span>
                      <span className="tabular-nums text-muted-foreground">{ltr(m.start)}</span>
                      <span className={cn("size-2 shrink-0 rounded-full", SUBJECT_SWATCH[m.subjectColor])} aria-hidden />
                      <bdi className="truncate">{m.subjectName}</bdi>
                    </span>
                    <span className={cn("flex shrink-0 items-center gap-1 font-medium", m.status === "absent" ? "text-danger" : "text-warning")}>
                      {m.status === "absent" ? <X className="size-4" aria-hidden /> : <Clock className="size-4" aria-hidden />}
                      {m.status === "absent" ? t("absent") : m.minutesLate ? t("lateMinutes", { minutes: m.minutesLate }) : t("late")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {marks.length > RECENT && <p className="text-xs text-muted-foreground">{t("more", { count: marks.length - RECENT })}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
