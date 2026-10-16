"use client";

import { useState } from "react";

import type { SchoolDay } from "@/lib/structure/time-slot-template";
import type { TimeSlot } from "@/lib/structure/time-slots";
import type { TimetableLesson } from "@/lib/timetable/types";

import { LessonDialog, type LessonChoices } from "./lesson-dialog";
import { TimetableDays } from "./timetable-days";
import { TimetableGrid } from "./timetable-grid";
import { weekRows } from "./week-layout";

type Props = {
  classId: string;
  className: string;
  days: SchoolDay[];
  slots: TimeSlot[];
  /** This class's lessons. */
  lessons: TimetableLesson[];
  /** timetable.manage: add, change and delete lessons. */
  canManage: boolean;
  choices: LessonChoices;
};

type Open = { slot: TimeSlot; lesson?: TimetableLesson } | null;

/** One class's week: grid on desktop, a card per day on phones, and the lesson dialog. */
export function TimetableView({ classId, className, days, slots, lessons, canManage, choices }: Props) {
  const [open, setOpen] = useState<Open>(null);
  const lessonBySlot = new Map(lessons.map((l) => [l.slotId, l]));
  const handlers = canManage
    ? {
        onAdd: (slot: TimeSlot) => setOpen({ slot }),
        onOpen: (lesson: TimetableLesson, slot: TimeSlot) => setOpen({ slot, lesson }),
      }
    : {};

  return (
    <>
      <div className="hidden md:block">
        <TimetableGrid days={days} rows={weekRows(days, slots)} lessonBySlot={lessonBySlot} {...handlers} />
      </div>
      <div className="md:hidden">
        <TimetableDays days={days} slots={slots} lessonBySlot={lessonBySlot} {...handlers} />
      </div>
      {open && (
        <LessonDialog
          // A new key per cell: the form starts from that cell's values.
          key={`${open.slot.id}-${open.lesson?.id ?? "new"}`}
          classId={classId}
          className={className}
          slot={open.slot}
          lesson={open.lesson}
          onClose={() => setOpen(null)}
          {...choices}
        />
      )}
    </>
  );
}
