import { CalendarOff } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { LessonDayCard } from "@/components/features/attendance/lesson-day-card";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { redirect } from "@/i18n/navigation";
import { schoolClock } from "@/lib/attendance/clock";
import { getTeacherDays, type TodayLesson } from "@/lib/attendance/roll-call";
import { homeFor } from "@/lib/auth/roles";
import { requireArea } from "@/lib/auth/session";
import { ltr } from "@/lib/format";
import { DAY_KEYS, type SchoolDay } from "@/lib/structure/time-slot-template";

const shortDate = (date: string) => {
  const [y, m, d] = date.split("-");
  return ltr(`${d}/${m}/${y}`);
};

/**
 * A teacher's roll calls (mobile-first): today's lessons, the one going on now
 * first, each "À faire" or "Appel fait à 08:12"; then the next school day as a
 * preview (attendance opens that day; tapping shows the class list). Today
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
  const { today, next } = await getTeacherDays(user.schoolId, user.id, clock);
  const isNow = (l: TodayLesson) => l.start <= clock.time && clock.time < l.end;
  const ordered = [...today.filter(isNow), ...today.filter((l) => !isNow(l))];
  const dayName = (day: number) => tDays(DAY_KEYS[day as SchoolDay]);
  const todayLabel = clock.weekday <= 6 ? t("today", { day: dayName(clock.weekday), date: shortDate(clock.date) }) : shortDate(clock.date);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <PageHeader title={t("title")} description={t("intro")} />

      <section className="flex flex-col gap-3" aria-labelledby="today-title">
        <h2 id="today-title" className="text-lg font-semibold">
          {todayLabel}
        </h2>
        {ordered.length === 0 ? (
          <Card className="py-0">
            <EmptyState icon={CalendarOff} title={t("noLessonsTitle")} description={t("noLessonsDescription")} />
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {ordered.map((lesson) => (
              <li key={lesson.id}>
                <LessonDayCard lesson={lesson} href={`/attendance/${lesson.id}`} state={{ kind: "today", isNow: isNow(lesson) }} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {next && (
        <section className="flex flex-col gap-3" aria-labelledby="next-title">
          <div className="flex flex-col gap-0.5">
            <h2 id="next-title" className="text-lg font-semibold">
              {t("nextDay", { day: dayName(next.day), date: shortDate(next.date) })}
            </h2>
            <p className="text-sm text-muted-foreground">{t("nextDayHint", { day: dayName(next.day) })}</p>
          </div>
          <ul className="flex flex-col gap-3">
            {next.lessons.map((lesson) => (
              <li key={lesson.id}>
                <LessonDayCard lesson={lesson} href={`/my-timetable/${lesson.id}`} state={{ kind: "later", dayName: dayName(next.day) }} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
