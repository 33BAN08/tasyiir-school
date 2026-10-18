// "Now" for a timetable: the school's day and time (Africa/Casablanca, whatever
// the device's zone), the lesson going on and the next one. Client and server.

import type { TimeSlot } from "@/lib/structure/time-slots";

import type { TimetableLesson } from "./types";

/** Day 1 (Monday) … 7 (Sunday) and "HH:MM", at the school. */
export type SchoolClock = { day: number; time: string };

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function schoolClock(date: Date): SchoolClock {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Casablanca",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return { day: WEEKDAY[part("weekday")] ?? 7, time: `${part("hour")}:${part("minute")}` };
}

export type PlacedLesson = { lesson: TimetableLesson; slot: TimeSlot };
export type NowNext = { current?: PlacedLesson; next?: PlacedLesson };

/**
 * The lesson going on at `clock`, and the next one: later today, later this
 * week, else the first of next week (the timetable repeats every week).
 */
export function nowAndNext(lessons: TimetableLesson[], slotById: Map<string, TimeSlot>, clock: SchoolClock): NowNext {
  const placed = lessons
    .flatMap((lesson) => {
      const slot = slotById.get(lesson.slotId);
      return slot ? [{ lesson, slot }] : [];
    })
    .sort((a, b) => a.slot.day - b.slot.day || a.slot.startTime.localeCompare(b.slot.startTime));
  const current = placed.find(
    (p) => p.slot.day === clock.day && p.slot.startTime <= clock.time && clock.time < p.slot.endTime,
  );
  const later = placed.find((p) => p.slot.day > clock.day || (p.slot.day === clock.day && p.slot.startTime > clock.time));
  const next = later ?? placed[0];
  return { current, next: next && next !== current ? next : undefined };
}
