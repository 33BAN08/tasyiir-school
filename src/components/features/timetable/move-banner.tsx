"use client";

import { Move, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { isolate } from "@/lib/format";
import type { TimetableLesson } from "@/lib/timetable/types";

type Props = {
  lesson: TimetableLesson;
  /** The conflict of the cell under the pointer, already a sentence. */
  conflict: string | null;
  onCancel: () => void;
};

/** Shown while a lesson is being moved: what moves, how to drop it, why a cell refuses it. */
export function MoveBanner({ lesson, conflict, onCancel }: Props) {
  const t = useTranslations("timetable.move");
  return (
    <div
      // Stays in view under the top bar while the user scrolls to the target cell.
      className="sticky top-16 z-10 flex items-start gap-3 rounded-md border border-primary/40 bg-card p-3 text-sm shadow-sm"
      role="status"
      aria-live="polite"
    >
      <Move className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-medium">{t("title", { subject: isolate(lesson.subjectName), class: isolate(lesson.className) })}</p>
        <p className="text-muted-foreground">{t("hint")}</p>
        {conflict && <p className="font-medium text-danger">{conflict}</p>}
      </div>
      <Button type="button" variant="ghost" onClick={onCancel}>
        <X aria-hidden />
        {t("cancel")}
      </Button>
    </div>
  );
}
