"use client";

import { useState } from "react";

import type { SchoolDay } from "@/lib/structure/time-slot-template";
import type { TimeSlot } from "@/lib/structure/time-slots";
import type { TimetableLesson, TimetableOption } from "@/lib/timetable/types";

import type { LessonDetail } from "./lesson-card";
import { LessonDialog, type LessonChoices } from "./lesson-dialog";
import { TimetableDays } from "./timetable-days";
import { TimetableGrid } from "./timetable-grid";
import { weekRows } from "./week-layout";

type Props = {
  days: SchoolDay[];
  slots: TimeSlot[];
  /** The lessons of the class, teacher or room shown. */
  lessons: TimetableLesson[];
  /** What each lesson shows under its subject. */
  details: LessonDetail[];
  /** timetable.manage: change and delete lessons. */
  canManage: boolean;
  /** Class view only: empty cells add a lesson to this class. */
  addTo?: TimetableOption;
  choices: LessonChoices;
};

type Open = { slot: TimeSlot; lesson?: TimetableLesson } | null;

/** One week (a class's, a teacher's or a room's): grid on desktop, a card per day on phones, and the lesson dialog. */
export function TimetableView({ days, slots, lessons, details, canManage, addTo, choices }: Props) {
  const [open, setOpen] = useState<Open>(null);
  const lessonBySlot = new Map(lessons.map((l) => [l.slotId, l]));
  const handlers = {
    details,
    onAdd: canManage && addTo ? (slot: TimeSlot) => setOpen({ slot }) : undefined,
    onOpen: canManage ? (lesson: TimetableLesson, slot: TimeSlot) => setOpen({ slot, lesson }) : undefined,
  };
  const klass = open?.lesson ? { id: open.lesson.classId, name: open.lesson.className } : addTo;

  return (
    <>
      <div className="hidden md:block">
        <TimetableGrid days={days} rows={weekRows(days, slots)} lessonBySlot={lessonBySlot} {...handlers} />
      </div>
      <div className="md:hidden">
        <TimetableDays days={days} slots={slots} lessonBySlot={lessonBySlot} {...handlers} />
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
          {...choices}
        />
      )}
    </>
  );
}
