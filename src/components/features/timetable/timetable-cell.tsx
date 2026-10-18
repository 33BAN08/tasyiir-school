"use client";

import { ArrowLeftRight, Ban, MoveRight, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { isolate } from "@/lib/format";
import type { TimeSlot } from "@/lib/structure/time-slots";
import { conflictErrorKey, type DropPlan } from "@/lib/timetable/moves";
import type { TimetableLesson } from "@/lib/timetable/types";
import { cn } from "@/lib/utils";

import { HIGHLIGHT_FRAME, LessonCard, type LessonDetail, type LessonHighlight } from "./lesson-card";

/** Drag & drop of lessons in the desktop grid (timetable.manage). */
export type DragState = {
  /** The lesson being dragged, if any. */
  dragging: TimetableLesson | null;
  /** The slot under the pointer while dragging. */
  over: string | null;
  /** A move or swap is being saved: nothing can be dragged meanwhile. */
  pending: boolean;
  /** Where the dragged lesson would go on this slot (null: its own cell). */
  plan: (slot: TimeSlot) => DropPlan | null;
  onStart: (lesson: TimetableLesson) => void;
  onEnd: () => void;
  onOver: (slotId: string) => void;
  onDrop: (slot: TimeSlot, plan: DropPlan) => void;
};

type Props = {
  slot: TimeSlot;
  lesson?: TimetableLesson;
  details: LessonDetail[];
  /** Accessible names of the cell's buttons. */
  addLabel: string;
  openLabel: string;
  onAdd?: (slot: TimeSlot) => void;
  onOpen?: (lesson: TimetableLesson, slot: TimeSlot) => void;
  drag?: DragState;
  highlight?: LessonHighlight;
};

/** A lesson slot of the grid: its lesson (click to edit, drag to move) or a way to add one. */
export function TimetableCell({ slot, lesson, details, addLabel, openLabel, onAdd, onOpen, drag, highlight }: Props) {
  const plan = drag?.dragging ? drag.plan(slot) : null;
  const canDrop = !!plan && !plan.conflict;
  const isDragged = !!lesson && drag?.dragging?.id === lesson.id;

  let content;
  if (lesson && onOpen) {
    const draggable = !!drag && !drag.pending;
    content = (
      <button
        type="button"
        onClick={() => onOpen(lesson, slot)}
        aria-label={openLabel}
        draggable={draggable}
        onDragStart={
          draggable
            ? (event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", lesson.id); // Firefox drags only with data
                drag.onStart(lesson);
              }
            : undefined
        }
        onDragEnd={drag?.onEnd}
        className={cn(
          "size-full rounded-md border bg-card p-2 transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          draggable && "cursor-grab active:cursor-grabbing",
          isDragged && "opacity-50",
          highlight && HIGHLIGHT_FRAME[highlight],
        )}
      >
        <LessonCard lesson={lesson} details={details} highlight={highlight} />
      </button>
    );
  } else if (lesson) {
    content = (
      <div className={cn("size-full rounded-md border bg-card p-2", highlight && HIGHLIGHT_FRAME[highlight])}>
        <LessonCard lesson={lesson} details={details} highlight={highlight} />
      </div>
    );
  } else if (onAdd) {
    content = (
      <button
        type="button"
        onClick={() => onAdd(slot)}
        aria-label={addLabel}
        title={addLabel}
        className={cn(
          "group flex size-full min-h-14 items-center justify-center rounded-md border border-dashed text-muted-foreground",
          "transition-colors hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        )}
      >
        <Plus className="size-4 opacity-40 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
      </button>
    );
  } else {
    content = <div className="size-full min-h-14 rounded-md border border-dashed" />;
  }

  if (!drag) return content;
  return (
    <div
      className="relative size-full"
      onDragOver={(event) => {
        if (!drag.dragging) return;
        drag.onOver(slot.id);
        // Only a cell that can take the lesson accepts the drop.
        if (canDrop) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }
      }}
      onDrop={(event) => {
        if (!canDrop || !plan) return;
        event.preventDefault();
        drag.onDrop(slot, plan);
      }}
    >
      {content}
      {plan && <DropStatus plan={plan} over={drag.over === slot.id} />}
    </div>
  );
}

/** Shown on every cell while a lesson is dragged: move here, swap, or why not. */
function DropStatus({ plan, over }: { plan: DropPlan; over: boolean }) {
  const t = useTranslations("timetable.move");
  const conflict = plan.conflict;
  const text = conflict
    ? t(conflictErrorKey(conflict), { class: isolate(conflict.className) })
    : plan.swapWith
      ? t("swap", { subject: isolate(plan.swapWith.subjectName) })
      : t("here");
  const Icon = conflict ? Ban : plan.swapWith ? ArrowLeftRight : MoveRight;

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 flex items-end rounded-md border-2 p-1",
        conflict ? "border-destructive/50 bg-destructive/10" : "border-dashed border-primary bg-primary/5",
        over && !conflict && "border-solid bg-primary/15",
      )}
    >
      <span
        className={cn(
          "flex max-w-full items-start gap-1 rounded bg-card/95 px-1 py-0.5 text-xs font-medium",
          conflict ? "text-destructive" : "text-primary",
        )}
      >
        <Icon className="mt-px size-3.5 shrink-0 rtl:-scale-x-100" aria-hidden />
        <span className="line-clamp-2">{text}</span>
      </span>
    </div>
  );
}
