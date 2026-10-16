// How a school week is laid out as a grid (client + server): one row per
// distinct time range, one column per school day. Days may have different
// hours: a day without a slot at that time shows an empty, unusable cell.

import type { SchoolDay } from "@/lib/structure/time-slot-template";
import type { TimeSlot } from "@/lib/structure/time-slots";

export type WeekRow = {
  key: string;
  start: string;
  end: string;
  /** The slot of each day at this time, if any. */
  cells: Map<SchoolDay, TimeSlot>;
  /** Every slot of the row is a break (shown as a thin band). */
  isBreak: boolean;
};

export function weekRows(days: SchoolDay[], slots: TimeSlot[]): WeekRow[] {
  const rows = new Map<string, WeekRow>();
  for (const slot of slots) {
    if (!days.includes(slot.day)) continue;
    const key = `${slot.startTime}-${slot.endTime}`;
    const row = rows.get(key) ?? { key, start: slot.startTime, end: slot.endTime, cells: new Map(), isBreak: true };
    row.cells.set(slot.day, slot);
    row.isBreak = row.isBreak && slot.kind === "break";
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}
