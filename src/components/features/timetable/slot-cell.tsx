"use client";

import { ArrowLeftRight, CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { DragEvent, ReactNode } from "react";

import { isolate } from "@/lib/format";
import type { TimeSlot } from "@/lib/structure/time-slots";
import type { TimetableLesson } from "@/lib/timetable/types";
import { cn } from "@/lib/utils";

import type { LessonDetail } from "./lesson-card";
import type { MoveTarget } from "./move-plan";
import { useTimetableError } from "./use-timetable-error";

/** Drag & drop and "pick a cell" moves (timetable.manage). */
export type MoveHandlers = {
  /** What a drop on this slot would do; null when no lesson is being moved. */
  target: (slot: TimeSlot) => MoveTarget | null;
  onDragStart: (lesson: TimetableLesson) => void;
  onDragEnd: () => void;
  /** The pointer of a drag is over this slot (null: over none). */
  onHover: (slotId: string | null) => void;
  onDrop: (slot: TimeSlot) => void;
};

export type CellHandlers = {
  /** What each lesson shows under its subject (depends on the view: class, teacher or room). */
  details: LessonDetail[];
  /** Set when the user may add lessons: an empty lesson cell becomes a button. */
  onAdd?: (slot: TimeSlot) => void;
  /** Set when the user may edit lessons. */
  onOpen?: (lesson: TimetableLesson, slot: TimeSlot) => void;
  move?: MoveHandlers;
};

type Props = Omit<CellHandlers, "details"> & {
  slot: TimeSlot;
  lesson?: TimetableLesson;
  /** Day name and time range, for the labels. */
  where: { day: string; range: string };
  className: string;
  children: ReactNode;
};

const INTERACTIVE = "transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/**
 * One lesson slot of a week (grid cell or phone row). Normally: open the
 * lesson, add one, or nothing. While a lesson is being moved, every slot is a
 * drop target marked as a move, a swap or a conflict (shown before the drop).
 */
export function SlotCell({ slot, lesson, where, className, children, onAdd, onOpen, move }: Props) {
  const t = useTranslations("timetable.grid");
  const tMove = useTranslations("timetable.move");
  const translateError = useTimetableError();
  const target = move?.target(slot) ?? null;

  // A lesson can be picked up whenever the user may move lessons. The element
  // stays the same <button> while dragging (React must not replace it).
  const drag = move &&
    lesson && {
      draggable: true,
      onDragStart: (e: DragEvent) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", lesson.id);
        move.onDragStart(lesson);
      },
      onDragEnd: move.onDragEnd,
    };

  if (move && target) {
    const message = target.kind !== "source" && target.error ? translateError(target.error, target.conflict) : null;
    const label =
      target.kind === "source"
        ? tMove("source", where)
        : message
          ? `${tMove("conflictAt", where)}. ${message}`
          : target.partner
            ? tMove("swapHere", { ...where, subject: isolate(target.partner.subjectName) })
            : tMove("moveHere", where);
    return (
      <button
        type="button"
        {...drag}
        aria-label={label}
        title={message ?? label}
        onClick={() => move.onDrop(slot)}
        onDragEnter={() => move.onHover(slot.id)}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) move.onHover(null);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = message ? "none" : "move";
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (!message) move.onDrop(slot);
        }}
        className={cn(
          className,
          "relative transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          target.kind === "source" && "opacity-50 ring-2 ring-primary",
          target.kind !== "source" && !message && "border-dashed border-primary bg-primary/5 hover:bg-primary/10",
          message && "cursor-not-allowed border-danger bg-danger/10",
        )}
      >
        {children}
        {message && <CircleAlert className="absolute top-1 end-1 size-4 text-danger" aria-hidden />}
        {target.kind !== "source" && !message && target.partner && (
          <ArrowLeftRight className="absolute top-1 end-1 size-4 text-primary" aria-hidden />
        )}
      </button>
    );
  }

  const onClick = lesson ? (onOpen ? () => onOpen(lesson, slot) : undefined) : onAdd ? () => onAdd(slot) : undefined;
  if (!onClick) return <div className={className}>{children}</div>;
  const label = t(lesson ? "openLesson" : "addLesson", where);
  return (
    <button type="button" {...drag} onClick={onClick} aria-label={label} title={lesson ? undefined : label} className={cn(className, INTERACTIVE)}>
      {children}
    </button>
  );
}
