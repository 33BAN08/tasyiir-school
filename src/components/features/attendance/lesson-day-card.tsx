import { ChevronRight, CircleCheck, CircleDashed, LockKeyhole } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import type { TodayLesson } from "@/lib/attendance/roll-call";
import { isolate, ltr } from "@/lib/format";
import { SUBJECT_SWATCH } from "@/lib/structure/subject-template";
import { cn } from "@/lib/utils";

type Props = {
  lesson: TodayLesson;
  href: string;
  /** Today: "À faire" / "Appel fait à 08:12". Preview of another day: "L'appel s'ouvrira lundi". */
  state: { kind: "today"; isNow: boolean } | { kind: "later"; dayName: string };
};

/** One lesson of the teacher's day, a big tap target (roll call today, class list for a later day). */
export function LessonDayCard({ lesson, href, state }: Props) {
  const t = useTranslations("attendance");
  const isNow = state.kind === "today" && state.isNow;

  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-20 items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-muted/60",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        isNow && "border-primary ring-2 ring-primary",
        state.kind === "later" && "bg-muted/30",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{ltr(`${lesson.start}–${lesson.end}`)}</span>
          {isNow && <span className="rounded bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground">{t("now")}</span>}
        </span>
        <span className="flex items-center gap-2 text-base font-semibold">
          <span className={cn("size-2.5 shrink-0 rounded-full", SUBJECT_SWATCH[lesson.subjectColor])} aria-hidden />
          <bdi className="truncate">{lesson.subjectName}</bdi>
          <span className="text-muted-foreground">·</span>
          <bdi>{lesson.className}</bdi>
        </span>
        {lesson.roomName && <bdi className="text-sm text-muted-foreground">{lesson.roomName}</bdi>}
        {state.kind === "later" ? (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <LockKeyhole className="size-4" aria-hidden />
            {t("opensOn", { day: state.dayName })}
          </span>
        ) : lesson.takenAt ? (
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
      <span className="sr-only">{t(state.kind === "today" ? "open" : "openClass", { class: isolate(lesson.className) })}</span>
    </Link>
  );
}
