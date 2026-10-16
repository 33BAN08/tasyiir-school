import { SUBJECT_SWATCH } from "@/lib/structure/subject-template";
import type { TimetableLesson } from "@/lib/timetable/types";
import { cn } from "@/lib/utils";

/** What a timetable cell shows of a lesson: subject (colour dot + name), teacher, room. */
export function LessonCard({ lesson, className }: { lesson: TimetableLesson; className?: string }) {
  return (
    <span className={cn("flex min-w-0 flex-col items-start gap-0.5 text-start", className)}>
      <span className="flex max-w-full items-center gap-1.5 font-medium">
        <span className={cn("size-2.5 shrink-0 rounded-full", SUBJECT_SWATCH[lesson.subjectColor])} aria-hidden />
        <bdi className="truncate">{lesson.subjectName}</bdi>
      </span>
      <bdi className="max-w-full truncate text-xs text-muted-foreground">{lesson.teacherName}</bdi>
      {lesson.roomName && <bdi className="max-w-full truncate text-xs text-muted-foreground">{lesson.roomName}</bdi>}
    </span>
  );
}
