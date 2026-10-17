"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";

import { useRouter } from "@/i18n/navigation";
import type { TimeSlot } from "@/lib/structure/time-slots";
import { moveLesson, swapLessons } from "@/lib/timetable/move-actions";
import type { LessonActionResult, LessonConflict, TimetableLesson } from "@/lib/timetable/types";

import type { MoveTarget } from "./move-plan";

type TranslateError = (key: string, conflict?: LessonConflict) => string;

/**
 * Sends a drop to the server: a move to a free cell or a swap with the lesson
 * there. The success toast can undo it (move back, or swap again).
 */
export function useLessonMove() {
  const t = useTranslations("timetable.move");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<LessonActionResult<null>>, translateError: TranslateError, done: () => void) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(translateError(result.error, result.conflict));
        router.refresh(); // someone else may have changed the week
        return;
      }
      done();
      router.refresh();
    });

  /** False when the drop is refused before asking the server (a conflict, already explained). */
  const drop = (lesson: TimetableLesson, slot: TimeSlot, plan: MoveTarget, translateError: TranslateError): boolean => {
    if (plan.kind === "source") return false;
    if (plan.error) {
      toast.error(translateError(plan.error, plan.conflict));
      return false;
    }
    const partner = plan.partner;
    const forward = partner ? () => swapLessons(lesson.id, partner.id) : () => moveLesson(lesson.id, slot.id);
    const back = partner ? () => swapLessons(lesson.id, partner.id) : () => moveLesson(lesson.id, lesson.slotId);
    run(forward, translateError, () =>
      toast.success(t(partner ? "swapped" : "moved"), {
        action: {
          label: t("undo"),
          onClick: () => run(back, translateError, () => toast.success(t("undone"))),
        },
      }),
    );
    return true;
  };

  return { drop, pending };
}
