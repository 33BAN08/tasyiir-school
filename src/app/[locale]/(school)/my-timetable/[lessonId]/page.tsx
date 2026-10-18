import { ArrowLeft, ClipboardCheck, LockKeyhole, Users } from "lucide-react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import { StudentAvatar } from "@/components/features/students/student-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link, redirect } from "@/i18n/navigation";
import { schoolClock } from "@/lib/attendance/clock";
import { getLessonClass } from "@/lib/attendance/roll-call";
import { homeFor } from "@/lib/auth/roles";
import { requireArea } from "@/lib/auth/session";
import { ltr } from "@/lib/format";
import { SUBJECT_SWATCH } from "@/lib/structure/subject-template";
import { DAY_KEYS, type SchoolDay } from "@/lib/structure/time-slot-template";
import { studentInitials, studentName, studentOtherName } from "@/lib/students/names";
import { signPhotoUrls } from "@/lib/students/photos";
import { cn } from "@/lib/utils";

/**
 * One of the teacher's lessons, opened from "Mon emploi du temps" (read-only):
 * when and where, the class list, and — on the lesson's day — the way to the
 * roll call. Changing the timetable stays with the school's staff.
 */
export default async function TeacherLessonPage({ params }: PageProps<"/[locale]/my-timetable/[lessonId]">) {
  const user = await requireArea("school");
  if (user.roleKey !== "teacher" || !user.schoolId) return redirect({ href: homeFor(user), locale: await getLocale() });
  const { lessonId } = await params;
  if (!z.uuid().safeParse(lessonId).success) notFound();

  const [t, tDays, locale, clock] = await Promise.all([
    getTranslations("timetable.lesson"),
    getTranslations("setup.timeSlots.days"),
    getLocale(),
    schoolClock(),
  ]);
  const data = await getLessonClass(user.schoolId, user.id, lessonId, clock);
  if (!data) notFound();
  const { lesson, students } = data;
  const dayName = tDays(DAY_KEYS[lesson.day as SchoolDay]);
  const photos = await signPhotoUrls(students.map((s) => s.photoPath));

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link href="/my-timetable">
          <ArrowLeft className="rtl:-scale-x-100" aria-hidden />
          {t("back")}
        </Link>
      </Button>
      <div className="flex flex-col gap-1">
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
          <span className={cn("size-3 shrink-0 rounded-full", SUBJECT_SWATCH[lesson.subjectColor])} aria-hidden />
          <bdi>{lesson.subjectName}</bdi>
          <span className="text-muted-foreground">·</span>
          <bdi>{lesson.className}</bdi>
        </h1>
        <p className="text-muted-foreground">
          {t("when", { day: dayName, range: ltr(`${lesson.start}–${lesson.end}`) })}
          {lesson.roomName && (
            <>
              {" · "}
              <bdi>{lesson.roomName}</bdi>
            </>
          )}
        </p>
      </div>

      {data.isToday ? (
        <Button asChild size="lg" className="min-h-12 text-base">
          <Link href={`/attendance/${lesson.id}`}>
            <ClipboardCheck aria-hidden />
            {t("takeAttendance")}
          </Link>
        </Button>
      ) : (
        <p className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          <LockKeyhole className="size-4 shrink-0" aria-hidden />
          {t("opensOn", { day: dayName })}
        </p>
      )}

      <Card className="gap-3 py-4">
        <CardContent className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <Users className="size-4 text-muted-foreground" aria-hidden />
            {t("students", { count: students.length })}
          </h2>
          {students.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noStudents")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {students.map((s) => {
                const other = studentOtherName(s, locale);
                return (
                  <li key={s.id} className="flex min-h-12 items-center gap-3">
                    <StudentAvatar
                      url={(s.photoPath && photos.get(s.photoPath)) || null}
                      initials={studentInitials(s)}
                      alt=""
                      className="size-10 shrink-0 text-xs"
                    />
                    <span className="flex min-w-0 flex-col">
                      <bdi className="truncate font-medium">{studentName(s, locale)}</bdi>
                      {other && <bdi className="truncate text-sm text-muted-foreground">{other}</bdi>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">{t("changeHint")}</p>
    </div>
  );
}
