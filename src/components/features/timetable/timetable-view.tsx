"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import type { SchoolDay } from "@/lib/structure/time-slot-template";
import type { TimeSlot } from "@/lib/structure/time-slots";
import { conflictErrorKey, planDrop } from "@/lib/timetable/moves";
import type { TimetableLesson, TimetableOption } from "@/lib/timetable/types";
import { cn } from "@/lib/utils";

import type { LessonDetail } from "./lesson-card";
import { LessonDialog, type LessonChoices } from "./lesson-dialog";
import { MoveLessonDialog } from "./move-lesson-dialog";
import type { DragState } from "./timetable-cell";
import { TimetableDays } from "./timetable-days";
import { TimetableGrid } from "./timetable-grid";
import { useLessonMoves } from "./use-lesson-moves";
import { useTimetableError } from "./use-timetable-error";
import { weekRows } from "./week-layout";

type Props = {
  days: SchoolDay[];
  slots: TimeSlot[];
  /** The lessons of the class, teacher or room shown. */
  lessons: TimetableLesson[];
  /** What each lesson shows under its subject. */
  details: LessonDetail[];
  /** timetable.manage: change, move and delete lessons. */
  canManage: boolean;
  /** Class view only: empty cells add a lesson to this class. */
  addTo?: TimetableOption;
  choices: LessonChoices;
};

type Open = { slot: TimeSlot; lesson?: TimetableLesson; moving?: boolean } | null;

/**
 * One week (a class's, a teacher's or a room's): grid on desktop, a card per
 * day on phones, and the lesson dialogs. On desktop a lesson can be dragged
 * onto a free cell (move) or another lesson of the week (swap); while it is
 * dragged every cell says first whether it may go there.
 */
export function TimetableView({ days, slots, lessons, details, canManage, addTo, choices }: Props) {
  const t = useTranslations("timetable.move");
  const translateError = useTimetableError();
  const [open, setOpen] = useState<Open>(null);
  const [dragging, setDragging] = useState<TimetableLesson | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const { move, isPending } = useLessonMoves();

  const lessonBySlot = new Map(lessons.map((l) => [l.slotId, l]));
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const plan = (slot: TimeSlot) =>
    dragging ? planDrop(dragging, slot, lessonBySlot.get(slot.id), choices.yearLessons, slotById) : null;
  const stopDrag = () => {
    setDragging(null);
    setOver(null);
  };
  const drag: DragState | undefined = canManage
    ? {
        dragging,
        over,
        pending: isPending,
        plan,
        onStart: setDragging,
        onEnd: stopDrag,
        onOver: (slotId) => slotId !== over && setOver(slotId),
        onDrop: (slot, where) => {
          if (dragging) move(dragging, slot, where.swapWith);
          stopDrag();
        },
      }
    : undefined;
  const handlers = {
    details,
    onAdd: canManage && addTo ? (slot: TimeSlot) => setOpen({ slot }) : undefined,
    onOpen: canManage ? (lesson: TimetableLesson, slot: TimeSlot) => setOpen({ slot, lesson }) : undefined,
  };
  const klass = open?.lesson ? { id: open.lesson.classId, name: open.lesson.className } : addTo;

  // Under the grid: how to drag, or the full reason the hovered cell refuses the lesson.
  const overSlot = over ? slotById.get(over) : undefined;
  const refused = overSlot && plan(overSlot)?.conflict;

  return (
    <>
      <div className="hidden md:block">
        <TimetableGrid
          days={days}
          rows={weekRows(days, slots)}
          lessonBySlot={lessonBySlot}
          drag={drag}
          {...handlers}
        />
        {canManage && lessons.length > 0 && (
          <p aria-live="polite" className={cn("mt-3 text-sm", refused ? "text-destructive" : "text-muted-foreground")}>
            {refused ? translateError(conflictErrorKey(refused), refused) : t("hint")}
          </p>
        )}
      </div>
      <div className="md:hidden">
        <TimetableDays days={days} slots={slots} lessonBySlot={lessonBySlot} {...handlers} />
      </div>
      {open && klass && !open.moving && (
        <LessonDialog
          // A new key per cell: the form starts from that cell's values.
          key={`${open.slot.id}-${open.lesson?.id ?? "new"}`}
          classId={klass.id}
          className={klass.name}
          slot={open.slot}
          lesson={open.lesson}
          onClose={() => setOpen(null)}
          onMove={() => setOpen({ ...open, moving: true })}
          {...choices}
        />
      )}
      {open?.lesson && open.moving && (
        <MoveLessonDialog
          lesson={open.lesson}
          days={days}
          slots={slots}
          yearLessons={choices.yearLessons}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
