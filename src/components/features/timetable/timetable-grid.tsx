"use client";

import { useTranslations } from "next-intl";

import { TimeRange } from "@/components/features/setup/time-slot-day-card";
import { ltr } from "@/lib/format";
import { DAY_KEYS, type SchoolDay } from "@/lib/structure/time-slot-template";
import type { TimeSlot } from "@/lib/structure/time-slots";
import type { TimetableLesson } from "@/lib/timetable/types";

import type { LessonDetail, LessonHighlight } from "./lesson-card";
import { TimetableCell, type DragState } from "./timetable-cell";
import type { WeekRow } from "./week-layout";

export type CellHandlers = {
  /** What each lesson shows under its subject (depends on the view: class, teacher or room). */
  details: LessonDetail[];
  /** Set when the user may add lessons: an empty lesson cell becomes a button. */
  onAdd?: (slot: TimeSlot) => void;
  /** Set when a lesson can be opened (to edit it, or only to see it: see openLabel). */
  onOpen?: (lesson: TimetableLesson, slot: TimeSlot) => void;
  /** What opening a lesson does, for its accessible name: edit (staff, default) or view. */
  openLabel?: "openLesson" | "viewLesson";
  /** Set when lessons can be dragged to another cell (desktop grid only). */
  drag?: DragState;
  /** Slot id → the lesson there is going on now, or is the next one. */
  highlight?: Map<string, LessonHighlight>;
};

type Props = CellHandlers & {
  days: SchoolDay[];
  rows: WeekRow[];
  lessonBySlot: Map<string, TimetableLesson>;
};

/** The week as a table: days across, time ranges down (desktop). */
export function TimetableGrid({ days, rows, lessonBySlot, details, onAdd, onOpen, openLabel = "openLesson", drag, highlight }: Props) {
  const t = useTranslations("timetable.grid");
  const tDays = useTranslations("setup.timeSlots.days");

  return (
    <table className="w-full table-fixed border-separate border-spacing-1">
      <thead>
        <tr>
          <th scope="col" className="w-28 text-start text-xs font-medium text-muted-foreground">
            {t("time")}
          </th>
          {days.map((day) => (
            <th key={day} scope="col" className="text-start text-sm font-semibold">
              {tDays(DAY_KEYS[day])}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <th scope="row" className="text-start align-top text-xs font-normal text-muted-foreground">
              <span className="block pt-2">
                <TimeRange start={row.start} end={row.end} />
              </span>
            </th>
            {days.map((day) => {
              const slot = row.cells.get(day);
              const label = (name: string) => t(name, { day: tDays(DAY_KEYS[day]), range: ltr(`${row.start}–${row.end}`) });
              if (!slot) return <td key={day} className="rounded-md bg-muted/30" aria-label={label("noSlot")} />;
              if (slot.kind === "break") {
                return (
                  <td key={day} className="rounded-md bg-muted px-2 py-1 text-center text-xs text-muted-foreground">
                    {slot.label ?? t("break")}
                  </td>
                );
              }
              return (
                <td key={day} className="h-16 align-top">
                  <TimetableCell
                    slot={slot}
                    lesson={lessonBySlot.get(slot.id)}
                    details={details}
                    addLabel={label("addLesson")}
                    openLabel={label(openLabel)}
                    onAdd={onAdd}
                    onOpen={onOpen}
                    drag={drag}
                    highlight={highlight?.get(slot.id)}
                  />
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
