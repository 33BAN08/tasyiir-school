// What dropping a lesson on a cell would do (client): move it to a free cell,
// swap it with the lesson shown there, or nothing because of a conflict —
// worked out for every cell as soon as a drag starts, so conflicts show before
// the drop. Same rule as the Server Actions (`findClash`), on the year's lessons.

import type { TimeSlot } from "@/lib/structure/time-slots";
import { findClash } from "@/lib/timetable/clash";
import type { LessonConflict, TimetableLesson } from "@/lib/timetable/types";

export type MoveTarget =
  | { kind: "source" }
  | {
      kind: "move" | "swap";
      /** The lesson shown in the target cell (a swap). */
      partner?: TimetableLesson;
      /** A `timetable.errors` key when the drop is refused, with who is busy where. */
      error?: string;
      conflict?: LessonConflict;
    };

export type YearIndex = {
  /** Every lesson of the year, by time slot. */
  bySlot: Map<string, TimetableLesson[]>;
  slotById: Map<string, TimeSlot>;
};

export function yearIndex(lessons: TimetableLesson[], slots: TimeSlot[]): YearIndex {
  const bySlot = new Map<string, TimetableLesson[]>();
  for (const lesson of lessons) bySlot.set(lesson.slotId, [...(bySlot.get(lesson.slotId) ?? []), lesson]);
  return { bySlot, slotById: new Map(slots.map((s) => [s.id, s])) };
}

/** `moving` dropped on `target`, where the view shows `partner` (if any). */
export function planMove(
  moving: TimetableLesson,
  target: TimeSlot,
  partner: TimetableLesson | undefined,
  { bySlot, slotById }: YearIndex,
): MoveTarget {
  if (target.id === moving.slotId) return { kind: "source" };
  const kind = partner ? "swap" : "move";
  const ignore = partner ? [moving.id, partner.id] : [moving.id];

  // The moving lesson in the target slot, then the partner in the moving lesson's slot.
  const checks: [TimetableLesson, TimeSlot | undefined][] = [[moving, target]];
  if (partner) checks.push([partner, slotById.get(moving.slotId)]);
  for (const [lesson, slot] of checks) {
    if (!slot) continue;
    const clash = findClash(lesson, bySlot.get(slot.id) ?? [], ignore);
    if (!clash) continue;
    const when = { className: clash.lesson.className, day: slot.day, start: slot.startTime, end: slot.endTime };
    if (clash.kind === "class") return { kind, partner, error: "classBusy", conflict: { kind: "class", name: "", ...when } };
    if (clash.kind === "teacher") {
      return { kind, partner, error: "teacherBusyMove", conflict: { kind: "teacher", name: lesson.teacherName, ...when } };
    }
    return { kind, partner, error: "roomBusy", conflict: { kind: "room", name: lesson.roomName ?? "", ...when } };
  }
  return { kind, partner };
}
