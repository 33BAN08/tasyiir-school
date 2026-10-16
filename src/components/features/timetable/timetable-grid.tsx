"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { TimeRange } from "@/components/features/setup/time-slot-day-card";
import { ltr } from "@/lib/format";
import { DAY_KEYS, type SchoolDay } from "@/lib/structure/time-slot-template";
import type { TimeSlot } from "@/lib/structure/time-slots";
import type { TimetableLesson } from "@/lib/timetable/types";
import { cn } from "@/lib/utils";

import { LessonCard, type LessonDetail } from "./lesson-card";
import type { WeekRow } from "./week-layout";

export type CellHandlers = {
  /** What each lesson shows under its subject (depends on the view: class, teacher or room). */
  details: LessonDetail[];
  /** Set when the user may add lessons: an empty lesson cell becomes a button. */
  onAdd?: (slot: TimeSlot) => void;
  /** Set when the user may edit lessons. */
  onOpen?: (lesson: TimetableLesson, slot: TimeSlot) => void;
};

type Props = CellHandlers & {
  days: SchoolDay[];
  rows: WeekRow[];
  lessonBySlot: Map<string, TimetableLesson>;
};

/** The week as a table: days across, time ranges down (desktop). */
export function TimetableGrid({ days, rows, lessonBySlot, details, onAdd, onOpen }: Props) {
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
              const lesson = lessonBySlot.get(slot.id);
              return (
                <td key={day} className="h-16 align-top">
                  {lesson ? (
                    onOpen ? (
                      <button
                        type="button"
                        onClick={() => onOpen(lesson, slot)}
                        aria-label={label("openLesson")}
                        className="size-full rounded-md border bg-card p-2 transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <LessonCard lesson={lesson} details={details} />
                      </button>
                    ) : (
                      <div className="size-full rounded-md border bg-card p-2">
                        <LessonCard lesson={lesson} details={details} />
                      </div>
                    )
                  ) : onAdd ? (
                    <button
                      type="button"
                      onClick={() => onAdd(slot)}
                      aria-label={label("addLesson")}
                      title={label("addLesson")}
                      className={cn(
                        "group flex size-full min-h-14 items-center justify-center rounded-md border border-dashed text-muted-foreground",
                        "transition-colors hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      )}
                    >
                      <Plus className="size-4 opacity-40 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
                    </button>
                  ) : (
                    <div className="size-full min-h-14 rounded-md border border-dashed" />
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
