// Moving a lesson to another slot, or swapping it with the lesson there,
// checked in the browser BEFORE the drop so every cell can say whether the
// lesson may go there (the Server Actions check again, the database last).
// Same rule as a new booking: a class, a teacher and a room are in one place
// at a time.

import type { TimeSlot } from "@/lib/structure/time-slots";

import type { LessonConflict, TimetableLesson } from "./types";

export type DropPlan = {
  /** The lesson already in the target cell: the two lessons exchange slots. */
  swapWith?: TimetableLesson;
  /** Why the lesson (or the one it swaps with) cannot go there. */
  conflict?: LessonConflict;
};

/**
 * Where `lesson` would go on `target`, swapping with `swapWith` when set.
 * Null for its own cell and for breaks (nothing to do there).
 */
export function planDrop(
  lesson: TimetableLesson,
  target: TimeSlot,
  swapWith: TimetableLesson | undefined,
  yearLessons: TimetableLesson[],
  slotById: Map<string, TimeSlot>,
): DropPlan | null {
  if (target.id === lesson.slotId || target.kind !== "lesson" || swapWith?.id === lesson.id) return null;
  const moving = new Set([lesson.id, swapWith?.id]);

  const clash = (l: TimetableLesson, slot: TimeSlot | undefined): LessonConflict | undefined => {
    if (!slot) return undefined;
    const others = yearLessons.filter((o) => o.slotId === slot.id && !moving.has(o.id));
    const when = { day: slot.day, start: slot.startTime, end: slot.endTime };
    const sameClass = others.find((o) => o.classId === l.classId);
    if (sameClass) return { kind: "class", name: "", className: sameClass.className, ...when };
    const sameTeacher = others.find((o) => o.teacherId === l.teacherId);
    if (sameTeacher) return { kind: "teacher", name: l.teacherName, className: sameTeacher.className, ...when };
    const sameRoom = l.roomId ? others.find((o) => o.roomId === l.roomId) : undefined;
    if (sameRoom) return { kind: "room", name: l.roomName ?? "", className: sameRoom.className, ...when };
    return undefined;
  };

  const conflict = clash(lesson, target) ?? (swapWith ? clash(swapWith, slotById.get(lesson.slotId)) : undefined);
  return { swapWith, conflict };
}

/** The key that explains a conflict: a sentence under `timetable.errors`, a cell label under `timetable.move`. */
export function conflictErrorKey(conflict: LessonConflict): "classBusy" | "teacherBusy" | "roomBusy" {
  return conflict.kind === "class" ? "classBusy" : conflict.kind === "teacher" ? "teacherBusy" : "roomBusy";
}
