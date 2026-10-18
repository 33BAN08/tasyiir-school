import { ArrowLeft, CalendarOff } from "lucide-react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import { RollCall } from "@/components/features/attendance/roll-call";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { schoolClock } from "@/lib/attendance/clock";
import { getRollCall } from "@/lib/attendance/roll-call";
import { weekdayOf } from "@/lib/attendance/staff";
import { requireSchoolPermission } from "@/lib/auth/session";
import { ltr } from "@/lib/format";
import { SUBJECT_SWATCH } from "@/lib/structure/subject-template";
import { DAY_KEYS, type SchoolDay } from "@/lib/structure/time-slot-template";
import { studentInitials, studentName, studentOtherName } from "@/lib/students/names";
import { signPhotoUrls } from "@/lib/students/photos";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

/** Staff (attendance.manage) correct — or take — the roll call of a lesson on a day up to today (`?date=`). */
export default async function CorrectAttendancePage({ params, searchParams }: PageProps<"/[locale]/absences/[lessonId]">) {
  const user = await requireSchoolPermission("attendance.manage");
  const [{ lessonId }, sp] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(lessonId).success) notFound();
  const [t, tDays, locale, clock] = await Promise.all([
    getTranslations("absences"),
    getTranslations("setup.timeSlots.days"),
    getLocale(),
    schoolClock(),
  ]);
  const wanted = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : clock.date;
  const date = wanted <= clock.date ? wanted : clock.date;
  const rollCall = await getRollCall(user.schoolId, null, lessonId, { date, weekday: weekdayOf(date) });
  if (!rollCall) notFound();
  const { lesson } = rollCall;

  const supabase = await createClient();
  const [photos, teachers] = await Promise.all([
    signPhotoUrls(rollCall.students.map((s) => s.photoPath)),
    supabase.rpc("timetable_teachers"),
  ]);
  const teacher = (teachers.data ?? []).find((x) => x.id === lesson.teacherId)?.full_name;
  const [y, m, d] = date.split("-");
  const dayName = tDays(DAY_KEYS[lesson.day as SchoolDay]);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link href={`/absences?date=${date}`}>
          <ArrowLeft className="rtl:-scale-x-100" aria-hidden />
          {t("title")}
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
          {dayName} {ltr(`${d}/${m}/${y}`)} · {ltr(`${lesson.start}–${lesson.end}`)}
          {teacher && (
            <>
              {" · "}
              <bdi>{teacher}</bdi>
            </>
          )}
        </p>
        <p className="text-sm text-muted-foreground">{t("correct.hint")}</p>
      </div>

      {rollCall.isToday ? (
        <RollCall
          userId={user.id}
          lessonId={lesson.id}
          date={date}
          today={clock.date}
          mode="staff"
          students={rollCall.students.map((s) => ({
            id: s.id,
            name: studentName(s, locale),
            otherName: studentOtherName(s, locale),
            initials: studentInitials(s),
            photoUrl: (s.photoPath && photos.get(s.photoPath)) || null,
          }))}
          initialMarks={rollCall.marks}
          takenAt={rollCall.takenAt}
          updatedAt={rollCall.updatedAt}
        />
      ) : (
        <Card className="py-0">
          <EmptyState icon={CalendarOff} title={t("correct.wrongDayTitle")} description={t("correct.wrongDayDescription", { day: dayName })} />
        </Card>
      )}
    </div>
  );
}
