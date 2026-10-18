import { CalendarOff, ChevronRight, CircleCheck, CircleDashed } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Link, redirect } from "@/i18n/navigation";
import { schoolClock } from "@/lib/attendance/clock";
import { getTodayLessons, type TodayLesson } from "@/lib/attendance/roll-call";
import { homeFor } from "@/lib/auth/roles";
import { requireArea } from "@/lib/auth/session";
import { isolate, ltr } from "@/lib/format";
import { SUBJECT_SWATCH } from "@/lib/structure/subject-template";
import { DAY_KEYS, type SchoolDay } from "@/lib/structure/time-slot-template";
import { cn } from "@/lib/utils";

/**
 * A teacher's roll calls of today (mobile-first): their lessons in time order,
 * the one going on now first, each "À faire" or "Appel fait à 08:12". Today
 * and now are the school's (from the database).
 */
export default async function AttendancePage() {
  const user = await requireArea("school");
  if (user.roleKey !== "teacher" || !user.schoolId) return redirect({ href: homeFor(user), locale: await getLocale() });
  const [t, tDays, clock] = await Promise.all([
    getTranslations("attendance"),
    getTranslations("setup.timeSlots.days"),
    schoolClock(),
  ]);
  const lessons = await getTodayLessons(user.schoolId, user.id, clock);
  const isNow = (l: TodayLesson) => l.start <= clock.time && clock.time < l.end;
  const ordered = [...lessons.filter(isNow), ...lessons.filter((l) => !isNow(l))];
  const [y, m, d] = clock.date.split("-");
  const today =
    clock.weekday <= 6
      ? t("today", { day: tDays(DAY_KEYS[clock.weekday as SchoolDay]), date: ltr(`${d}/${m}/${y}`) })
      : ltr(`${d}/${m}/${y}`);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <PageHeader title={t("title")} description={today} />
      {ordered.length === 0 ? (
        <Card className="py-0">
          <EmptyState icon={CalendarOff} title={t("noLessonsTitle")} description={t("noLessonsDescription")} />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {ordered.map((lesson) => (
            <li key={lesson.id}>
              <Link
                href={`/attendance/${lesson.id}`}
                className={cn(
                  "flex min-h-20 items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-muted/60",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  isNow(lesson) && "border-primary ring-2 ring-primary",
                )}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>{ltr(`${lesson.start}–${lesson.end}`)}</span>
                    {isNow(lesson) && (
                      <span className="rounded bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground">{t("now")}</span>
                    )}
                  </span>
                  <span className="flex items-center gap-2 text-base font-semibold">
                    <span className={cn("size-2.5 shrink-0 rounded-full", SUBJECT_SWATCH[lesson.subjectColor])} aria-hidden />
                    <bdi className="truncate">{lesson.subjectName}</bdi>
                    <span className="text-muted-foreground">·</span>
                    <bdi>{lesson.className}</bdi>
                  </span>
                  {lesson.roomName && <bdi className="text-sm text-muted-foreground">{lesson.roomName}</bdi>}
                  {lesson.takenAt ? (
                    <span className="flex items-center gap-1.5 text-sm font-medium text-success">
                      <CircleCheck className="size-4" aria-hidden />
                      {t("rollCall.takenAt", { time: ltr(lesson.takenAt) })}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-sm font-medium text-warning">
                      <CircleDashed className="size-4" aria-hidden />
                      {t("toDo")}
                    </span>
                  )}
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground rtl:-scale-x-100" aria-hidden />
                <span className="sr-only">{t("open", { class: isolate(lesson.className) })}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
