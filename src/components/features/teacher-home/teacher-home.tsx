import { CalendarOff, ClipboardCheck, MessageSquareText, NotebookPen, type LucideIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/layout/empty-state";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { schoolClock } from "@/lib/attendance/clock";
import { getTeacherDays } from "@/lib/attendance/roll-call";
import { countLessonStudents, focusLesson, lessonStatus } from "@/lib/attendance/teacher-home";
import { getModules } from "@/lib/auth/modules";
import type { CurrentUser } from "@/lib/auth/session";
import { ltr } from "@/lib/format";
import { DAY_KEYS, type SchoolDay } from "@/lib/structure/time-slot-template";

import { TodayLessonRow } from "./today-lesson-row";

const shortDate = (date: string) => {
  const [y, m, d] = date.split("-");
  return ltr(`${d}/${m}/${y}`);
};

/**
 * The teacher's home (Madar app refresh, 2026-10-25): the day, the lesson to
 * take the roll call of now (or the next one), today's lessons with their real
 * status, and shortcuts. Every figure comes from the timetable + attendance
 * sessions (getTeacherDays) and the school's clock from the database.
 */
export async function TeacherHome({ user }: { user: CurrentUser & { schoolId: string } }) {
  const [t, tDays, clock, modules] = await Promise.all([
    getTranslations("teacherHome"),
    getTranslations("setup.timeSlots.days"),
    schoolClock(),
    getModules(),
  ]);
  const { today, next } = await getTeacherDays(user.schoolId, user.id, clock);
  const focus = focusLesson(today, clock);
  const counts = await countLessonStudents(user.schoolId, focus ? [focus.lesson.id] : []);
  const dayName = (day: number) => (day >= 1 && day <= 6 ? tDays(DAY_KEYS[day as SchoolDay]) : null);
  const todayName = dayName(clock.weekday);

  const shortcuts: { href: string; label: string; icon: LucideIcon; show: boolean }[] = [
    { href: "/grades", label: t("shortcuts.grades"), icon: NotebookPen, show: modules.has("grades") },
    { href: "/remarks", label: t("shortcuts.remarks"), icon: MessageSquareText, show: modules.has("messaging") },
  ];

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      {/* The green band, as on the parent home: full width on phones, a rounded block from md up. */}
      <header className="app-zellige on-brand -mx-4 -mt-4 flex flex-col gap-1 px-4 pt-4 pb-6 md:mx-0 md:mt-0 md:rounded-3xl md:p-6">
        <h1 className="text-2xl font-extrabold" dir="auto">
          {t("greeting", { name: user.fullName })}
        </h1>
        <p className="text-muted-foreground">
          {todayName ? t("dayLine", { day: todayName, date: shortDate(clock.date), count: today.length }) : shortDate(clock.date)}
        </p>
      </header>

      {focus ? (
        <section
          data-focus-lesson={focus.kind}
          aria-labelledby="focus-title"
          className="flex flex-col gap-4 rounded-3xl border bg-card p-5 shadow-lg"
        >
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-extrabold tracking-wide text-primary uppercase">{t(`focus.${focus.kind}`)}</span>
            {!focus.lesson.takenAt && (
              <span className="rounded-full bg-sand px-2.5 py-1 text-xs font-extrabold text-on-sand">{t("focus.toDo")}</span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <h2 id="focus-title" className="text-2xl font-extrabold">
              <bdi>{focus.lesson.subjectName}</bdi> · <bdi dir="ltr">{focus.lesson.className}</bdi>
            </h2>
            <p className="text-muted-foreground">
              {[
                ltr(`${focus.lesson.start} – ${focus.lesson.end}`),
                focus.lesson.roomName,
                counts.has(focus.lesson.id) ? t("students", { count: counts.get(focus.lesson.id)! }) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <Link
            href={`/attendance/${focus.lesson.id}`}
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-lg font-extrabold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ClipboardCheck className="size-6" aria-hidden />
            {focus.lesson.takenAt ? t("focus.open") : t("focus.rollCall")}
          </Link>
        </section>
      ) : today.length > 0 ? (
        <Card className="py-0" data-focus-lesson="done">
          <EmptyState icon={ClipboardCheck} title={t("dayDoneTitle")} description={t("dayDoneDescription")} />
        </Card>
      ) : (
        <Card className="py-0" data-focus-lesson="none">
          <EmptyState
            icon={CalendarOff}
            title={t("noLessonsTitle")}
            description={
              next ? t("noLessonsNext", { day: dayName(next.day) ?? "", count: next.lessons.length }) : t("noLessonsDescription")
            }
          />
        </Card>
      )}

      {today.length > 0 && (
        <section aria-labelledby="today-lessons" className="flex flex-col gap-2">
          <h2 id="today-lessons" className="text-sm font-bold text-muted-foreground">
            {t("todayTitle")}
          </h2>
          <ul className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
            {today.map((lesson) => (
              <TodayLessonRow key={lesson.id} lesson={lesson} status={lessonStatus(lesson, clock)} />
            ))}
          </ul>
        </section>
      )}

      {shortcuts.some((s) => s.show) && (
        <nav aria-label={t("shortcuts.label")} className="grid grid-cols-2 gap-3">
          {shortcuts
            .filter((s) => s.show)
            .map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                data-shortcut={href}
                className="flex min-h-20 flex-col justify-center gap-2 rounded-2xl border bg-card p-4 font-bold outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Icon className="size-6 text-primary" aria-hidden />
                {label}
              </Link>
            ))}
        </nav>
      )}
    </div>
  );
}
