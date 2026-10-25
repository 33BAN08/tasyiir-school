import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { SchoolClock } from "./clock";
import type { TodayLesson } from "./roll-call";

// The teacher's home (/dashboard for the teacher role): today's lessons with a
// status from the real roll-call data, the lesson to open now, and the class
// sizes. Reads with the TEACHER's own session (RLS: their lessons, their
// classes' enrolments, as for the roll call).

export type LessonStatus = "done" | "todo" | "later";

/** Roll call taken → done; started and not taken → to do; not started yet → later. */
export function lessonStatus(lesson: TodayLesson, clock: SchoolClock): LessonStatus {
  if (lesson.takenAt) return "done";
  return lesson.start <= clock.time ? "todo" : "later";
}

/**
 * The lesson the big "Faire l'appel" card is about: the one going on now,
 * else the next one today, else (all over) the last one with its roll call
 * still to do, else nothing ("day done").
 */
export function focusLesson(today: TodayLesson[], clock: SchoolClock): { lesson: TodayLesson; kind: "now" | "next" | "missed" } | null {
  const now = today.find((l) => l.start <= clock.time && clock.time < l.end);
  if (now) return { lesson: now, kind: "now" };
  const next = today.find((l) => l.start > clock.time);
  if (next) return { lesson: next, kind: "next" };
  const missed = [...today].reverse().find((l) => !l.takenAt);
  return missed ? { lesson: missed, kind: "missed" } : null;
}

/** Number of students per lesson's class this year (lesson id → count); unknown lessons are left out. */
export async function countLessonStudents(schoolId: string, lessonIds: string[]): Promise<Map<string, number>> {
  if (lessonIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data: lessons } = await supabase
    .from("lessons")
    .select("id, class_id, academic_year_id")
    .eq("school_id", schoolId)
    .in("id", lessonIds);
  const classIds = [...new Set((lessons ?? []).map((l) => l.class_id))];
  if (classIds.length === 0) return new Map();
  const { data: enrolments } = await supabase
    .from("student_enrollments")
    .select("class_id, academic_year_id")
    .eq("school_id", schoolId)
    .in("class_id", classIds);
  const perClass = new Map<string, number>();
  for (const e of enrolments ?? []) perClass.set(`${e.class_id}|${e.academic_year_id}`, (perClass.get(`${e.class_id}|${e.academic_year_id}`) ?? 0) + 1);
  return new Map((lessons ?? []).map((l) => [l.id, perClass.get(`${l.class_id}|${l.academic_year_id}`) ?? 0]));
}
