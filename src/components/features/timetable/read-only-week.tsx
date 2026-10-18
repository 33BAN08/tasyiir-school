"use client";

import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { ltr } from "@/lib/format";
import { DAY_KEYS, type SchoolDay } from "@/lib/structure/time-slot-template";
import type { TimeSlot } from "@/lib/structure/time-slots";
import { nowAndNext, type PlacedLesson } from "@/lib/timetable/now";
import type { TimetableLesson } from "@/lib/timetable/types";
import { cn } from "@/lib/utils";

import { HIGHLIGHT_FRAME, LessonCard, type LessonDetail, type LessonHighlight } from "./lesson-card";
import { TimetableDays } from "./timetable-days";
import { TimetableGrid } from "./timetable-grid";
import { useSchoolClock } from "./use-school-clock";
import { weekRows } from "./week-layout";

type Props = {
  days: SchoolDay[];
  slots: TimeSlot[];
  lessons: TimetableLesson[];
  /** What each lesson shows under its subject. */
  details: LessonDetail[];
  /** "days": one card per day at every width (narrow shells); "responsive": the grid from md up. */
  layout: "days" | "responsive";
  /** Set: tapping a lesson opens `<lessonHrefBase><lesson id>` (to see it — never to edit). Unset: nothing is clickable. */
  lessonHrefBase?: string;
};

/**
 * A week to read, not to edit (a teacher's own, a child's class). Lessons
 * are clickable only to open a read-only page (lessonHrefBase), never to
 * edit. The lesson going on now and the next one are named on top and
 * outlined in the week (school time, Africa/Casablanca).
 */
export function ReadOnlyWeek({ days, slots, lessons, details, layout, lessonHrefBase }: Props) {
  const clock = useSchoolClock();
  const router = useRouter();
  const open = lessonHrefBase
    ? { onOpen: (lesson: TimetableLesson) => router.push(`${lessonHrefBase}${lesson.id}`), openLabel: "viewLesson" as const }
    : {};
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const lessonBySlot = new Map(lessons.map((l) => [l.slotId, l]));
  const { current, next } = clock ? nowAndNext(lessons, slotById, clock) : {};
  const highlight = new Map<string, LessonHighlight>();
  if (current) highlight.set(current.slot.id, "now");
  if (next) highlight.set(next.slot.id, "next");

  const dayCards = <TimetableDays days={days} slots={slots} lessonBySlot={lessonBySlot} details={details} highlight={highlight} {...open} />;
  return (
    <div className="flex flex-col gap-4">
      {(current || next) && <NowNextCard current={current} next={next} details={details} />}
      {layout === "days" ? (
        dayCards
      ) : (
        <>
          <div className="hidden md:block">
            <TimetableGrid days={days} rows={weekRows(days, slots)} lessonBySlot={lessonBySlot} details={details} highlight={highlight} {...open} />
          </div>
          <div className="md:hidden">{dayCards}</div>
        </>
      )}
    </div>
  );
}

function NowNextCard({ current, next, details }: { current?: PlacedLesson; next?: PlacedLesson; details: LessonDetail[] }) {
  const t = useTranslations("timetable.highlight");
  const tDays = useTranslations("setup.timeSlots.days");
  const row = (placed: PlacedLesson, value: LessonHighlight) => (
    <div className={cn("flex flex-col gap-1 rounded-md border p-3", HIGHLIGHT_FRAME[value])}>
      <span className="text-xs text-muted-foreground">
        {t(value === "now" ? "nowTitle" : "nextTitle", {
          day: tDays(DAY_KEYS[placed.slot.day]),
          range: ltr(`${placed.slot.startTime}–${placed.slot.endTime}`),
        })}
      </span>
      <LessonCard lesson={placed.lesson} details={details} />
    </div>
  );
  return (
    <Card className="py-4">
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {current && row(current, "now")}
        {next && row(next, "next")}
      </CardContent>
    </Card>
  );
}
