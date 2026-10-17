"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { TimeRange } from "@/components/features/setup/time-slot-day-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ltr } from "@/lib/format";
import { DAY_KEYS, type SchoolDay } from "@/lib/structure/time-slot-template";
import type { TimeSlot } from "@/lib/structure/time-slots";
import type { TimetableLesson } from "@/lib/timetable/types";

import { LessonCard } from "./lesson-card";
import { SlotCell, type CellHandlers } from "./slot-cell";

type Props = CellHandlers & {
  days: SchoolDay[];
  slots: TimeSlot[];
  lessonBySlot: Map<string, TimetableLesson>;
};

/** The week as one card per day (phones): each slot of the day, its lesson or a way to add one. */
export function TimetableDays({ days, slots, lessonBySlot, details, ...handlers }: Props) {
  const t = useTranslations("timetable.grid");
  const tDays = useTranslations("setup.timeSlots.days");

  return (
    <div className="flex flex-col gap-4">
      {days.map((day) => {
        const daySlots = slots.filter((s) => s.day === day);
        const dayName = tDays(DAY_KEYS[day]);
        return (
          <Card key={day} className="gap-3">
            <CardHeader>
              <CardTitle>{dayName}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-1.5">
                {daySlots.map((slot) => {
                  const lesson = lessonBySlot.get(slot.id);
                  const time = (
                    <span className="w-24 shrink-0 pt-0.5 text-xs text-muted-foreground">
                      <TimeRange start={slot.startTime} end={slot.endTime} />
                    </span>
                  );
                  if (slot.kind === "break") {
                    return (
                      <li key={slot.id} className="flex gap-3 rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground">
                        {time}
                        <span>{slot.label ?? t("break")}</span>
                      </li>
                    );
                  }
                  return (
                    <li key={slot.id}>
                      <SlotCell
                        slot={slot}
                        lesson={lesson}
                        where={{ day: dayName, range: ltr(`${slot.startTime}–${slot.endTime}`) }}
                        className="flex min-h-11 w-full gap-3 rounded-md border px-3 py-2 text-start"
                        {...handlers}
                      >
                        {time}
                        {lesson ? (
                          <LessonCard lesson={lesson} details={details} className="flex-1" />
                        ) : (
                          <span className="flex flex-1 items-center gap-1 text-sm text-muted-foreground">
                            {handlers.onAdd && <Plus className="size-4" aria-hidden />}
                            {handlers.onAdd ? t("add") : t("free")}
                          </span>
                        )}
                      </SlotCell>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
