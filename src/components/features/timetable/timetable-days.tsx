"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { TimeRange } from "@/components/features/setup/time-slot-day-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ltr } from "@/lib/format";
import { DAY_KEYS, type SchoolDay } from "@/lib/structure/time-slot-template";
import type { TimeSlot } from "@/lib/structure/time-slots";
import type { TimetableLesson } from "@/lib/timetable/types";
import { cn } from "@/lib/utils";

import { HIGHLIGHT_FRAME, LessonCard } from "./lesson-card";
import type { CellHandlers } from "./timetable-grid";

type Props = CellHandlers & {
  days: SchoolDay[];
  slots: TimeSlot[];
  lessonBySlot: Map<string, TimetableLesson>;
};

/** The week as one card per day (phones): each slot of the day, its lesson or a way to add one. */
export function TimetableDays({ days, slots, lessonBySlot, details, onAdd, onOpen, openLabel = "openLesson", highlight }: Props) {
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
                  const lit = lesson ? highlight?.get(slot.id) : undefined;
                  const label = (name: string) => t(name, { day: dayName, range: ltr(`${slot.startTime}–${slot.endTime}`) });
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
                  const content = lesson ? (
                    <LessonCard lesson={lesson} details={details} highlight={lit} className="flex-1" />
                  ) : (
                    <span className="flex flex-1 items-center gap-1 text-sm text-muted-foreground">
                      {onAdd && <Plus className="size-4" aria-hidden />}
                      {onAdd ? t("add") : t("free")}
                    </span>
                  );
                  const onClick = lesson ? (onOpen ? () => onOpen(lesson, slot) : undefined) : onAdd ? () => onAdd(slot) : undefined;
                  return (
                    <li key={slot.id}>
                      {onClick ? (
                        <button
                          type="button"
                          onClick={onClick}
                          aria-label={label(lesson ? openLabel : "addLesson")}
                          className="flex min-h-11 w-full gap-3 rounded-md border px-3 py-2 text-start transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          {time}
                          {content}
                        </button>
                      ) : (
                        <div className={cn("flex min-h-11 gap-3 rounded-md border px-3 py-2", lit && HIGHLIGHT_FRAME[lit])}>
                          {time}
                          {content}
                        </div>
                      )}
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
