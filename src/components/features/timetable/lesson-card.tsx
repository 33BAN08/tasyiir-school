import { SUBJECT_SWATCH } from "@/lib/structure/subject-template";
import type { TimetableLesson } from "@/lib/timetable/types";
import { cn } from "@/lib/utils";

/** What a cell adds under the subject: the other two of class / teacher / room. */
export type LessonDetail = "class" | "teacher" | "room";

const DETAIL_TEXT: Record<LessonDetail, (lesson: TimetableLesson) => string | null> = {
  class: (lesson) => lesson.className,
  teacher: (lesson) => lesson.teacherName,
  room: (lesson) => lesson.roomName,
};

type Props = { lesson: TimetableLesson; details: LessonDetail[]; className?: string };

/** What a timetable cell shows of a lesson: subject (colour dot + name), then its details. */
export function LessonCard({ lesson, details, className }: Props) {
  return (
    <span className={cn("flex min-w-0 flex-col items-start gap-0.5 text-start", className)}>
      <span className="flex max-w-full items-center gap-1.5 font-medium">
        <span className={cn("size-2.5 shrink-0 rounded-full", SUBJECT_SWATCH[lesson.subjectColor])} aria-hidden />
        <bdi className="truncate">{lesson.subjectName}</bdi>
      </span>
      {details.map((detail) => {
        const text = DETAIL_TEXT[detail](lesson);
        return (
          text && (
            <bdi key={detail} className={cn("max-w-full truncate text-xs", detail === "class" ? "font-medium" : "text-muted-foreground")}>
              {text}
            </bdi>
          )
        );
      })}
    </span>
  );
}
