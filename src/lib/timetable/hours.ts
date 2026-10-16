// Weekly hours of a timetable (client + server): the sum of the lessons' slot
// lengths. Shown as hours + minutes ("26 h 30"), never as a decimal.

import { toMinutes } from "@/lib/structure/time-slot-template";

/** Length of one slot in minutes ("08:00"–"09:00" → 60). */
export function slotMinutes(slot: { startTime: string; endTime: string }): number {
  return toMinutes(slot.endTime) - toMinutes(slot.startTime);
}

/** 1590 → { hours: 26, minutes: "30" }: the parameters of the `timetable.duration` message. */
export function durationParts(totalMinutes: number): { hours: number; minutes: string; hasMinutes: "yes" | "no" } {
  const minutes = totalMinutes % 60;
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: String(minutes).padStart(2, "0"),
    hasMinutes: minutes === 0 ? "no" : "yes",
  };
}
