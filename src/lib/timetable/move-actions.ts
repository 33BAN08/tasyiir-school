"use server";

import { logAudit } from "@/lib/audit";
import { getSchoolActor, type SchoolActor } from "@/lib/auth/school-actor";
import { dbErrorKey } from "@/lib/structure/db-errors";
import { createClient } from "@/lib/supabase/server";
import { lessonIdSchema } from "@/lib/validations/timetable";

import { checkBooking, LESSON_CONSTRAINTS, type Supabase } from "./booking";
import type { LessonActionResult } from "./types";

// Drag & drop (Phase 6 step 4): move a lesson to an empty cell, or swap two
// lessons' cells. Same rules as adding one (session + RLS, timetable.manage):
// the lessons keep their class, subject, teacher and room, only the time slot
// changes. Checked first to say who is busy where; the database has the last
// word (a swap runs in one transaction, all or nothing).

type LessonSeat = {
  id: string;
  timeSlotId: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  roomId: string;
};

async function getLesson(supabase: Supabase, actor: SchoolActor, id: string): Promise<LessonSeat | null> {
  const { data } = await supabase
    .from("lessons")
    .select("id, time_slot_id, class_id, subject_id, teacher_id, room_id")
    .eq("id", id)
    .eq("school_id", actor.schoolId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    timeSlotId: data.time_slot_id,
    classId: data.class_id,
    subjectId: data.subject_id,
    teacherId: data.teacher_id,
    roomId: data.room_id ?? "",
  };
}

/** Moves a lesson to another time slot of its year, where its class, teacher and room are free. */
export async function moveLesson(lessonId: unknown, timeSlotId: unknown): Promise<LessonActionResult<null>> {
  const actor = await getSchoolActor("timetable.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = lessonIdSchema.safeParse(lessonId);
  const slot = lessonIdSchema.safeParse(timeSlotId);
  if (!id.success || !slot.success) return { ok: false, error: "notFound" };

  const supabase = await createClient();
  const lesson = await getLesson(supabase, actor, id.data);
  if (!lesson) return { ok: false, error: "notFound" };
  if (lesson.timeSlotId === slot.data) return { ok: true, data: null };

  const checked = await checkBooking(supabase, actor, { ...lesson, timeSlotId: slot.data }, { ignore: [lesson.id], moving: true });
  if (!checked.ok) return checked;

  const { data, error } = await supabase
    .from("lessons")
    .update({ time_slot_id: slot.data })
    .eq("id", lesson.id)
    .eq("school_id", actor.schoolId)
    .select("id");
  if (error) return { ok: false, error: dbErrorKey(error, LESSON_CONSTRAINTS) };
  if (data.length === 0) return { ok: false, error: "notFound" };

  await logAudit({
    actorId: actor.id,
    schoolId: actor.schoolId,
    action: "lesson.move",
    entity: "lesson",
    entityId: lesson.id,
    data: { class_id: lesson.classId, from_time_slot_id: lesson.timeSlotId, to_time_slot_id: slot.data },
  });
  return { ok: true, data: null };
}

/** Exchanges two lessons' time slots (same year), if each one's class, teacher and room are free in the other's slot. */
export async function swapLessons(lessonA: unknown, lessonB: unknown): Promise<LessonActionResult<null>> {
  const actor = await getSchoolActor("timetable.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const idA = lessonIdSchema.safeParse(lessonA);
  const idB = lessonIdSchema.safeParse(lessonB);
  if (!idA.success || !idB.success || idA.data === idB.data) return { ok: false, error: "notFound" };

  const supabase = await createClient();
  const [a, b] = await Promise.all([getLesson(supabase, actor, idA.data), getLesson(supabase, actor, idB.data)]);
  if (!a || !b) return { ok: false, error: "notFound" };
  if (a.timeSlotId === b.timeSlotId) return { ok: false, error: "notFound" };

  const ignore = [a.id, b.id];
  for (const [lesson, target] of [
    [a, b],
    [b, a],
  ] as const) {
    const checked = await checkBooking(supabase, actor, { ...lesson, timeSlotId: target.timeSlotId }, { ignore, moving: true });
    if (!checked.ok) return checked;
  }

  const { error } = await supabase.rpc("swap_lessons", { p_a: a.id, p_b: b.id });
  if (error) return { ok: false, error: dbErrorKey(error, LESSON_CONSTRAINTS) };

  await logAudit({
    actorId: actor.id,
    schoolId: actor.schoolId,
    action: "lesson.swap",
    entity: "lesson",
    entityId: a.id,
    data: { lesson_a: a.id, lesson_b: b.id, slot_a: a.timeSlotId, slot_b: b.timeSlotId },
  });
  return { ok: true, data: null };
}
