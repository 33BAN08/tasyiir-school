import { ArrowLeft, CalendarOff } from "lucide-react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import { RollCall } from "@/components/features/attendance/roll-call";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link, redirect } from "@/i18n/navigation";
import { schoolClock } from "@/lib/attendance/clock";
import { getRollCall } from "@/lib/attendance/roll-call";
import { homeFor } from "@/lib/auth/roles";
import { requireArea } from "@/lib/auth/session";
import { ltr } from "@/lib/format";
import { SUBJECT_SWATCH } from "@/lib/structure/subject-template";
import { studentInitials, studentName, studentOtherName } from "@/lib/students/names";
import { signPhotoUrls } from "@/lib/students/photos";
import { cn } from "@/lib/utils";

/** Today's roll call of one of the teacher's lessons (mobile-first). */
export default async function RollCallPage({ params }: PageProps<"/[locale]/attendance/[lessonId]">) {
  const user = await requireArea("school");
  if (user.roleKey !== "teacher" || !user.schoolId) return redirect({ href: homeFor(user), locale: await getLocale() });
  const { lessonId } = await params;
  if (!z.uuid().safeParse(lessonId).success) notFound();

  const [t, locale, clock] = await Promise.all([getTranslations("attendance"), getLocale(), schoolClock()]);
  const rollCall = await getRollCall(user.schoolId, user.id, lessonId, clock);
  if (!rollCall) notFound();
  const { lesson } = rollCall;
  const photos = await signPhotoUrls(rollCall.students.map((s) => s.photoPath));

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link href="/attendance">
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
          {ltr(`${lesson.start}–${lesson.end}`)}
          {lesson.roomName && (
            <>
              {" · "}
              <bdi>{lesson.roomName}</bdi>
            </>
          )}
        </p>
      </div>

      {rollCall.isToday ? (
        <RollCall
          userId={user.id}
          lessonId={lesson.id}
          date={clock.date}
          today={clock.date}
          mode="teacher"
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
          <EmptyState icon={CalendarOff} title={t("notTodayTitle")} description={t("notTodayDescription")} />
        </Card>
      )}
    </div>
  );
}
