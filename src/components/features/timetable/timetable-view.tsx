"use client";

import { useEffect, useMemo, useState } from "react";

import type { SchoolDay } from "@/lib/structure/time-slot-template";
import type { TimeSlot } from "@/lib/structure/time-slots";
import type { TimetableLesson, TimetableOption } from "@/lib/timetable/types";
import { cn } from "@/lib/utils";

import type { LessonDetail } from "./lesson-card";
import { LessonDialog, type LessonChoices } from "./lesson-dialog";
import { MoveBanner } from "./move-banner";
import { planMove, yearIndex } from "./move-plan";
import type { MoveHandlers } from "./slot-cell";
import { TimetableDays } from "./timetable-days";
import { TimetableGrid } from "./timetable-grid";
import { useLessonMove } from "./use-lesson-move";
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

type Open = { slot: TimeSlot; lesson?: TimetableLesson } | null;
/** The lesson being moved: dragged (desktop) or picked from its dialog, then dropped with a click or tap. */
type Moving = { lesson: TimetableLesson; by: "drag" | "pick" } | null;

/** One week (a class's, a teacher's or a room's): grid on desktop, a card per day on phones, the lesson dialog and moves. */
export function TimetableView({ days, slots, lessons, details, canManage, addTo, choices }: Props) {
  const [open, setOpen] = useState<Open>(null);
  const [moving, setMoving] = useState<Moving>(null);
  const [hoverSlotId, setHoverSlotId] = useState<string | null>(null);
  const translateError = useTimetableError();
  const { drop, pending } = useLessonMove();
  const lessonBySlot = new Map(lessons.map((l) => [l.slotId, l]));
  const index = useMemo(() => yearIndex(choices.yearLessons, slots), [choices.yearLessons, slots]);

  const stop = () => {
    setMoving(null);
    setHoverSlotId(null);
  };
  // Escape puts a picked lesson back (a drag is cancelled by the browser).
  useEffect(() => {
    if (moving?.by !== "pick") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && stop();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moving]);

  const target = (slot: TimeSlot) => (moving ? planMove(moving.lesson, slot, lessonBySlot.get(slot.id), index) : null);
  const move: MoveHandlers | undefined = canManage
    ? {
        target,
        // Changing the page while the browser starts a drag can cancel it: mark the cells just after.
        onDragStart: (lesson) => setTimeout(() => setMoving({ lesson, by: "drag" })),
        onDragEnd: () => setTimeout(stop), // after a pending onDragStart update
        onHover: setHoverSlotId,
        onDrop: (slot) => {
          const plan = target(slot);
          if (!moving || !plan) return;
          if (plan.kind === "source") return stop();
          if (!drop(moving.lesson, slot, plan, translateError)) return; // refused: keep picking
          stop();
        },
      }
    : undefined;
  const handlers = {
    details,
    move,
    onAdd: canManage && addTo ? (slot: TimeSlot) => setOpen({ slot }) : undefined,
    onOpen: canManage ? (lesson: TimetableLesson, slot: TimeSlot) => setOpen({ slot, lesson }) : undefined,
  };
  const klass = open?.lesson ? { id: open.lesson.classId, name: open.lesson.className } : addTo;
  const hovered = hoverSlotId ? index.slotById.get(hoverSlotId) : undefined;
  const hoverPlan = hovered ? target(hovered) : null;
  const conflict = hoverPlan && hoverPlan.kind !== "source" && hoverPlan.error ? translateError(hoverPlan.error, hoverPlan.conflict) : null;

  return (
    <>
      {moving && <MoveBanner lesson={moving.lesson} conflict={conflict} onCancel={stop} />}
      <div aria-busy={pending} className={cn(pending && "pointer-events-none opacity-60")}>
        <div className="hidden md:block">
          <TimetableGrid days={days} rows={weekRows(days, slots)} lessonBySlot={lessonBySlot} {...handlers} />
        </div>
        <div className="md:hidden">
          <TimetableDays days={days} slots={slots} lessonBySlot={lessonBySlot} {...handlers} />
        </div>
      </div>
      {open && klass && (
        <LessonDialog
          // A new key per cell: the form starts from that cell's values.
          key={`${open.slot.id}-${open.lesson?.id ?? "new"}`}
          classId={klass.id}
          className={klass.name}
          slot={open.slot}
          lesson={open.lesson}
          onClose={() => setOpen(null)}
          onMove={(lesson) => {
            setOpen(null);
            setMoving({ lesson, by: "pick" });
          }}
          {...choices}
        />
      )}
    </>
  );
}
