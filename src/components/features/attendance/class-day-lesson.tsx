import { CircleAlert, CircleCheck, Clock, PencilLine, X } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { DayLesson } from "@/lib/attendance/staff";
import { isolate, ltr } from "@/lib/format";
import { SUBJECT_SWATCH } from "@/lib/structure/subject-template";
import { studentName } from "@/lib/students/names";
import { cn } from "@/lib/utils";

type Props = {
  lesson: DayLesson;
  date: string;
  /** attendance.manage: correct (or take) this roll call. */
  canManage: boolean;
};

/** One lesson of a class's day (staff): who took attendance and when, who was absent or late, and a way to correct it. */
export async function ClassDayLesson({ lesson, date, canManage }: Props) {
  const [t, locale] = await Promise.all([getTranslations("absences.day"), getLocale()]);
  const { session } = lesson;
  const marks = session?.marks ?? [];

  return (
    <Card className="gap-3 py-4">
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm text-muted-foreground">{ltr(`${lesson.start}–${lesson.end}`)}</span>
            <span className="flex items-center gap-2 font-semibold">
              <span className={cn("size-2.5 shrink-0 rounded-full", SUBJECT_SWATCH[lesson.subjectColor])} aria-hidden />
              <bdi className="truncate">{lesson.subjectName}</bdi>
            </span>
            {lesson.teacherName && <bdi className="text-sm text-muted-foreground">{lesson.teacherName}</bdi>}
          </div>
          {canManage && lesson.lessonId && (
            <Button asChild variant={session ? "outline" : "default"} size="sm">
              <Link href={`/absences/${lesson.lessonId}?date=${date}`}>
                <PencilLine aria-hidden />
                {t(session ? "correct" : "take")}
              </Link>
            </Button>
          )}
        </div>

        {session ? (
          <p className="flex items-center gap-1.5 text-sm text-success">
            <CircleCheck className="size-4 shrink-0" aria-hidden />
            <span>
              {t(session.byTeacher ? "takenByTeacher" : "takenByStaff", { time: ltr(session.takenAt) })}
              {session.updatedAt && <> · {t("updatedAt", { time: ltr(session.updatedAt) })}</>}
            </span>
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-sm font-medium text-warning">
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            {t("notTaken")}
          </p>
        )}
        {!lesson.lessonId && <p className="text-xs text-muted-foreground">{t("lessonDeleted")}</p>}

        {session &&
          (marks.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("allPresent")}</p>
          ) : (
            <ul className="flex flex-col gap-1.5" aria-label={t("marksLabel")}>
              {marks.map((m) => (
                <li key={m.studentId} className="flex items-center justify-between gap-3 text-sm">
                  <bdi className="truncate">{studentName(m, locale)}</bdi>
                  <span
                    className={cn(
                      "flex shrink-0 items-center gap-1 font-medium",
                      m.status === "absent" ? "text-danger" : "text-warning",
                    )}
                  >
                    {m.status === "absent" ? <X className="size-4" aria-hidden /> : <Clock className="size-4" aria-hidden />}
                    {m.status === "absent"
                      ? t("absent")
                      : m.minutesLate
                        ? t("lateMinutes", { minutes: m.minutesLate })
                        : t("late")}
                  </span>
                </li>
              ))}
            </ul>
          ))}
        {marks.some((m) => m.note) && (
          <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
            {marks
              .filter((m) => m.note)
              .map((m) => (
                <li key={m.studentId}>{t("note", { name: isolate(studentName(m, locale)), note: m.note ?? "" })}</li>
              ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
