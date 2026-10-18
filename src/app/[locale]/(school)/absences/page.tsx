import { CalendarOff } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { ClassDayLesson } from "@/components/features/attendance/class-day-lesson";
import { ClassTotals } from "@/components/features/attendance/class-totals";
import { ClassSelect } from "@/components/features/attendance/class-select";
import { DayNav } from "@/components/features/attendance/day-nav";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { schoolClock } from "@/lib/attendance/clock";
import { getClassTotals } from "@/lib/attendance/history";
import { PERIODS, periodRange } from "@/lib/attendance/periods";
import { getClassDay, weekdayOf, yearOf } from "@/lib/attendance/staff";
import { getPermissions, requireSchoolPermission } from "@/lib/auth/session";
import { ltr } from "@/lib/format";
import { listAcademicYears } from "@/lib/structure/academic-years";
import { listClasses } from "@/lib/structure/classes";
import { DAY_KEYS, type SchoolDay } from "@/lib/structure/time-slot-template";
import { cn } from "@/lib/utils";

type Wanted = { view?: string; date?: string; class?: string; period?: string };

/**
 * Staff (attendance.view), two views of a class (`?view=day|totals`):
 * - day: each lesson of one day, whether attendance was taken (by whom, when)
 *   and who was absent or late;
 * - totals: each student's absences (count, hours) and late arrivals over
 *   this week / month / school year.
 * attendance.manage corrects any day up to today, or takes a forgotten roll
 * call. The day is the school's (from the database), never later than today.
 */
export default async function AbsencesPage({ searchParams }: PageProps<"/[locale]/absences">) {
  const user = await requireSchoolPermission("attendance.view");
  const [permissions, t] = await Promise.all([getPermissions(), getTranslations("absences")]);
  const wanted = searchParams.then((sp): Wanted => {
    const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
    return { view: one(sp.view), date: one(sp.date), class: one(sp.class), period: one(sp.period) };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <DaySection schoolId={user.schoolId} wanted={wanted} canManage={permissions.has("attendance.manage")} />
      </Suspense>
    </div>
  );
}

async function DaySection({ schoolId, wanted, canManage }: { schoolId: string; wanted: Promise<Wanted>; canManage: boolean }) {
  const [want, clock, years, t, tDays] = await Promise.all([
    wanted,
    schoolClock(),
    listAcademicYears(schoolId),
    getTranslations("absences"),
    getTranslations("setup.timeSlots.days"),
  ]);
  const view = want.view === "totals" ? "totals" : "day";
  const date = want.date && /^\d{4}-\d{2}-\d{2}$/.test(want.date) && want.date <= clock.date ? want.date : clock.date;
  // Totals: the school year of today (else the most recent one).
  const year = view === "totals" ? (yearOf(years, clock.date) ?? years[0]) : yearOf(years, date);
  const classes = year ? await listClasses(schoolId, year.id) : [];
  const selected = classes.find((c) => c.id === want.class) ?? classes[0];
  const weekday = weekdayOf(date);
  const [y, m, d] = date.split("-");
  const dayLabel = `${weekday <= 6 ? `${tDays(DAY_KEYS[weekday as SchoolDay])} ` : ""}${ltr(`${d}/${m}/${y}`)}`;

  const period = PERIODS.find((p) => p === want.period) ?? "year";
  const classQuery = selected ? `&class=${selected.id}` : "";
  const controls = (
    <div className="flex flex-wrap items-center gap-4">
      <nav aria-label={t("views.label")} className="inline-flex rounded-lg bg-muted p-1">
        {(["day", "totals"] as const).map((v) => (
          <Link
            key={v}
            href={v === "day" ? `/absences?view=day&date=${date}${classQuery}` : `/absences?view=totals${classQuery}`}
            aria-current={v === view ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
              v === view && "bg-background text-foreground shadow-sm",
            )}
          >
            {t(`views.${v}`)}
          </Link>
        ))}
      </nav>
      {view === "day" && <DayNav date={date} today={clock.date} keep={selected ? `class=${selected.id}` : undefined} />}
      {selected && (
        <ClassSelect classes={classes} value={selected.id} keep={view === "day" ? `date=${date}` : `view=totals&period=${period}`} />
      )}
    </div>
  );
  if (!year || !selected) {
    return (
      <section className="flex flex-col gap-4">
        {controls}
        <Card className="py-0">
          <EmptyState icon={CalendarOff} title={t(year ? "noClassesTitle" : "noYearTitle")} description={t(year ? "noClassesDescription" : "noYearDescription")} />
        </Card>
      </section>
    );
  }

  if (view === "totals") {
    const { from, to } = periodRange(period, clock.date, year);
    const rows = await getClassTotals(schoolId, selected.id, year.id, from, to);
    return (
      <section className="flex flex-col gap-4">
        {controls}
        <h2 className="text-lg font-semibold">
          <bdi>{selected.name}</bdi> · {ltr(year.label)}
        </h2>
        <ClassTotals rows={rows} classId={selected.id} period={period} from={from} to={to} />
      </section>
    );
  }

  const day = await getClassDay(schoolId, selected.id, year.id, date);
  const sessions = day.lessons.filter((l) => l.session);
  const marks = sessions.flatMap((l) => l.session?.marks ?? []);
  const absentStudents = new Set(marks.filter((mk) => mk.status === "absent").map((mk) => mk.studentId)).size;

  return (
    <section className="flex flex-col gap-4">
      {controls}
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">
          <bdi>{selected.name}</bdi> · {dayLabel}
        </h2>
        {day.lessons.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {t("day.summary", {
              taken: sessions.length,
              total: day.lessons.length,
              absent: absentStudents,
              late: marks.filter((mk) => mk.status === "late").length,
            })}
          </p>
        )}
      </div>
      {day.lessons.length === 0 ? (
        <Card className="py-0">
          <EmptyState icon={CalendarOff} title={t("day.noLessonsTitle")} description={t("day.noLessonsDescription")} />
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {day.lessons.map((lesson) => (
            <li key={lesson.key}>
              <ClassDayLesson lesson={lesson} date={date} canManage={canManage} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
