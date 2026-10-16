"use client";

import { useTranslations } from "next-intl";

import { isolate, ltr } from "@/lib/format";
import { DAY_KEYS, type SchoolDay } from "@/lib/structure/time-slot-template";
import type { LessonConflict } from "@/lib/timetable/types";

/**
 * Translates a `timetable.errors` key. A conflict says who is busy, with which
 * class, on which day and hours ("Enseignant Test B a déjà cours avec 1AC-A…").
 * An unknown key falls back to the generic message.
 */
export function useTimetableError(): (key: string, conflict?: LessonConflict) => string {
  const t = useTranslations("timetable.errors");
  const tDays = useTranslations("setup.timeSlots.days");
  return (key, conflict) => {
    const k = key as Parameters<typeof t>[0];
    if (!t.has(k)) return t("generic");
    if (!conflict) return t(k);
    return t(k, {
      name: isolate(conflict.name),
      class: isolate(conflict.className),
      day: tDays(DAY_KEYS[conflict.day as SchoolDay]),
      range: ltr(`${conflict.start}–${conflict.end}`),
    });
  };
}
