import { CircleCheck, CircleDashed, Clock } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import type { TodayLesson } from "@/lib/attendance/roll-call";
import type { LessonStatus } from "@/lib/attendance/teacher-home";
import { cn } from "@/lib/utils";

const STATUS = {
  done: { icon: CircleCheck, className: "bg-success/12 text-foreground", iconClass: "text-success" },
  todo: { icon: CircleDashed, className: "bg-warning/15 text-foreground", iconClass: "text-warning" },
  later: { icon: Clock, className: "bg-muted text-muted-foreground", iconClass: "text-muted-foreground" },
} as const;

/** One of today's lessons: time, subject · class, room, and its roll-call status (icon + words). Opens the roll call. */
export function TodayLessonRow({ lesson, status }: { lesson: TodayLesson; status: LessonStatus }) {
  const t = useTranslations("teacherHome.status");
  const s = STATUS[status];

  return (
    <li>
      <Link
        href={`/attendance/${lesson.id}`}
        data-today-lesson={lesson.id}
        data-status={status}
        className="flex min-h-16 items-center gap-3 px-4 py-3 outline-none hover:bg-muted/50 focus-visible:bg-muted"
      >
        <span dir="ltr" className="w-12 shrink-0 font-numeric font-bold tabular-nums">
          {lesson.start}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-bold">
            <bdi>{lesson.subjectName}</bdi> · <bdi dir="ltr">{lesson.className}</bdi>
          </span>
          {lesson.roomName && <span className="truncate text-sm text-muted-foreground">{lesson.roomName}</span>}
        </span>
        <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold", s.className)}>
          <s.icon className={cn("size-3.5", s.iconClass)} aria-hidden />
          {t(status)}
        </span>
      </Link>
    </li>
  );
}
