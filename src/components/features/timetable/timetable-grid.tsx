"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { TimeRange } from "@/components/features/setup/time-slot-day-card";
import { ltr } from "@/lib/format";
import { DAY_KEYS, type SchoolDay } from "@/lib/structure/time-slot-template";
import type { TimetableLesson } from "@/lib/timetable/types";
import { cn } from "@/lib/utils";

import { LessonCard } from "./lesson-card";
import { SlotCell, type CellHandlers } from "./slot-cell";
import type { WeekRow } from "./week-layout";

type Props = CellHandlers & {
  days: SchoolDay[];
  rows: WeekRow[];
  lessonBySlot: Map<string, TimetableLesson>;
};

/** The week as a table: days across, time ranges down (desktop). */
export function TimetableGrid({ days, rows, lessonBySlot, details, ...handlers }: Props) {
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
              const where = { day: tDays(DAY_KEYS[day]), range: ltr(`${row.start}–${row.end}`) };
              if (!slot) return <td key={day} className="rounded-md bg-muted/30" aria-label={t("noSlot", where)} />;
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
                  <SlotCell
                    slot={slot}
                    lesson={lesson}
                    where={where}
                    className={cn(
                      "size-full rounded-md border",
                      lesson ? "bg-card p-2" : "group flex min-h-14 items-center justify-center border-dashed text-muted-foreground",
                    )}
                    {...handlers}
                  >
                    {lesson ? (
                      <LessonCard lesson={lesson} details={details} />
                    ) : (
                      handlers.onAdd && (
                        <Plus className="size-4 opacity-40 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
                      )
                    )}
                  </SlotCell>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
