"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";

import { useRouter } from "@/i18n/navigation";
import { ltr } from "@/lib/format";
import { DAY_KEYS } from "@/lib/structure/time-slot-template";
import type { TimeSlot } from "@/lib/structure/time-slots";
import type { LessonActionResult } from "@/lib/timetable/lesson-checks";
import { moveLesson, swapLessons } from "@/lib/timetable/move-actions";
import type { TimetableLesson } from "@/lib/timetable/types";

import { useTimetableError } from "./use-timetable-error";

type Result = LessonActionResult<null>;

/** Moves or swaps a lesson, says so in a toast with an "Undo" button, then refreshes the page. */
export function useLessonMoves() {
  const t = useTranslations("timetable.move");
  const tDays = useTranslations("setup.timeSlots.days");
  const translateError = useTimetableError();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const run = (action: () => Promise<Result>, success: string, undo?: () => Promise<Result>, onDone?: () => void) => {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(translateError(result.error, result.conflict));
        return;
      }
      toast.success(success, undo && { action: { label: t("undo"), onClick: () => run(undo, t("undone")) } });
      onDone?.();
      router.refresh();
    });
  };

  /** `lesson` goes to `target`; with `swapWith`, that lesson takes `lesson`'s slot. */
  const move = (lesson: TimetableLesson, target: TimeSlot, swapWith?: TimetableLesson, onDone?: () => void) => {
    if (swapWith) {
      // Swapping again puts both back.
      const swap = () => swapLessons(lesson.id, swapWith.id);
      run(swap, t("swapped"), swap, onDone);
      return;
    }
    const from = lesson.slotId;
    run(
      () => moveLesson(lesson.id, target.id),
      t("moved", { day: tDays(DAY_KEYS[target.day]), range: ltr(`${target.startTime}–${target.endTime}`) }),
      () => moveLesson(lesson.id, from),
      onDone,
    );
  };

  return { move, isPending };
}
