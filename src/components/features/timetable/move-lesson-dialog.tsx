"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isolate, ltr } from "@/lib/format";
import { DAY_KEYS, type SchoolDay } from "@/lib/structure/time-slot-template";
import type { TimeSlot } from "@/lib/structure/time-slots";
import { conflictErrorKey, planDrop, type DropPlan } from "@/lib/timetable/moves";
import type { TimetableLesson } from "@/lib/timetable/types";

import { useLessonMoves } from "./use-lesson-moves";

type Props = {
  lesson: TimetableLesson;
  days: SchoolDay[];
  slots: TimeSlot[];
  /** Every lesson of the year (who is busy at which slot). */
  yearLessons: TimetableLesson[];
  onClose: () => void;
};

/**
 * Move a lesson without dragging (keyboard, phones): pick another slot of the
 * week. If the lesson's class already has a lesson there, the two swap. Slots
 * where the class, teacher or room is busy are listed but cannot be chosen.
 */
export function MoveLessonDialog({ lesson, days, slots, yearLessons, onClose }: Props) {
  const t = useTranslations("timetable.move");
  const tDialog = useTranslations("timetable.dialog");
  const tDays = useTranslations("setup.timeSlots.days");
  const { move, isPending } = useLessonMoves();
  const [targetId, setTargetId] = useState("");

  const slotById = new Map(slots.map((s) => [s.id, s]));
  const current = slotById.get(lesson.slotId);
  const options = slots.flatMap((slot) => {
    const swapWith = yearLessons.find((l) => l.classId === lesson.classId && l.slotId === slot.id);
    const plan = planDrop(lesson, slot, swapWith, yearLessons, slotById);
    return plan ? [{ slot, plan }] : [];
  });
  const chosen = options.find((o) => o.slot.id === targetId);

  const status = (plan: DropPlan) => {
    const c = plan.conflict;
    if (c) {
      return t(conflictErrorKey(c), { class: isolate(c.className) });
    }
    return plan.swapWith ? t("swap", { subject: isolate(plan.swapWith.subjectName) }) : t("free");
  };
  const range = (slot: TimeSlot) => ltr(`${slot.startTime}–${slot.endTime}`);
  const where = current
    ? tDialog("where", { class: isolate(lesson.className), day: tDays(DAY_KEYS[current.day]), range: range(current) })
    : isolate(lesson.className);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description", { subject: isolate(lesson.subjectName), where })}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="move-target">{t("target")}</FieldLabel>
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger id="move-target" className="w-full">
              <SelectValue placeholder={t("targetPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {days.map((day) => {
                const ofDay = options.filter((o) => o.slot.day === day);
                if (ofDay.length === 0) return null;
                return (
                  <SelectGroup key={day}>
                    <SelectLabel>{tDays(DAY_KEYS[day])}</SelectLabel>
                    {ofDay.map(({ slot, plan }) => (
                      <SelectItem key={slot.id} value={slot.id} disabled={!!plan.conflict}>
                        <span>{t("slot", { day: tDays(DAY_KEYS[day]), range: range(slot) })}</span>
                        <span className={plan.conflict ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                          — {status(plan)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                );
              })}
            </SelectContent>
          </Select>
          <FieldDescription>{t("rules")}</FieldDescription>
        </Field>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isPending}>
              {t("cancel")}
            </Button>
          </DialogClose>
          <Button
            type="button"
            disabled={!chosen || !!chosen.plan.conflict || isPending}
            onClick={() => chosen && move(lesson, chosen.slot, chosen.plan.swapWith, onClose)}
          >
            {isPending ? t("moving") : t(chosen?.plan.swapWith ? "submitSwap" : "submitMove")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
