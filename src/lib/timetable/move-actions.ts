"use server";

import { logAudit } from "@/lib/audit";
import { getSchoolActor } from "@/lib/auth/school-actor";
import { dbErrorKey } from "@/lib/structure/db-errors";
import { createClient } from "@/lib/supabase/server";
import { lessonIdSchema } from "@/lib/validations/timetable";

import { CONSTRAINTS, checkBooking, type Booking, type LessonActionResult, type Supabase } from "./lesson-checks";

// Drag & drop (and the "Déplacer" dialog): move a lesson to a free slot, or
// swap two lessons' slots. Same session + RLS writes and same checks as a new
// booking, so a refusal says who is busy with which class when. A swap goes
// through swap_lessons() so both lessons move or neither does.

const SWAP_CONSTRAINTS = { ...CONSTRAINTS, swap_lessons_not_found: "notFound", swap_lessons_other_year: "notFound" };

type LessonRow = { id: string; class_id: string; time_slot_id: string; subject_id: string; teacher_id: string; room_id: string | null };

async function loadLessons(supabase: Supabase, schoolId: string, ids: string[]): Promise<LessonRow[]> {
  const { data } = await supabase
    .from("lessons")
    .select("id, class_id, time_slot_id, subject_id, teacher_id, room_id")
    .eq("school_id", schoolId)
    .in("id", ids);
  return data ?? [];
}

/** The lesson booked again at another slot (same class, subject, teacher, room). */
function bookingAt(lesson: LessonRow, timeSlotId: string): Booking {
  return {
    classId: lesson.class_id,
    timeSlotId,
    subjectId: lesson.subject_id,
    teacherId: lesson.teacher_id,
    roomId: lesson.room_id ?? "",
  };
}

/** Moves a lesson to another slot of its year (a free cell for its class). */
export async function moveLesson(lessonId: unknown, timeSlotId: unknown): Promise<LessonActionResult<null>> {
  const actor = await getSchoolActor("timetable.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = lessonIdSchema.safeParse(lessonId);
  const to = lessonIdSchema.safeParse(timeSlotId);
  if (!id.success || !to.success) return { ok: false, error: "notFound" };

  const supabase = await createClient();
  const [lesson] = await loadLessons(supabase, actor.schoolId, [id.data]);
  if (!lesson) return { ok: false, error: "notFound" };
  if (lesson.time_slot_id === to.data) return { ok: true, data: null };

  // Also refuses a slot of another year: the class must belong to the slot's year.
  const checked = await checkBooking(supabase, actor, bookingAt(lesson, to.data), [lesson.id]);
  if (!checked?.ok) return checked ?? { ok: false, error: "generic" };

  const { data, error } = await supabase
    .from("lessons")
    .update({ time_slot_id: to.data })
    .eq("id", lesson.id)
    .eq("school_id", actor.schoolId)
    .select("id");
  if (error) return { ok: false, error: dbErrorKey(error, CONSTRAINTS) };
  if (data.length === 0) return { ok: false, error: "notFound" };

  await logAudit({
    actorId: actor.id,
    schoolId: actor.schoolId,
    action: "lesson.move",
    entity: "lesson",
    entityId: lesson.id,
    data: { class_id: lesson.class_id, from_slot_id: lesson.time_slot_id, to_slot_id: to.data },
  });
  return { ok: true, data: null };
}

/** Exchanges two lessons' slots (a lesson dropped onto another one). */
export async function swapLessons(lessonA: unknown, lessonB: unknown): Promise<LessonActionResult<null>> {
  const actor = await getSchoolActor("timetable.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const a = lessonIdSchema.safeParse(lessonA);
  const b = lessonIdSchema.safeParse(lessonB);
  if (!a.success || !b.success || a.data === b.data) return { ok: false, error: "notFound" };

  const supabase = await createClient();
  const rows = await loadLessons(supabase, actor.schoolId, [a.data, b.data]);
  const first = rows.find((r) => r.id === a.data);
  const second = rows.find((r) => r.id === b.data);
  if (!first || !second) return { ok: false, error: "notFound" };

  // Each lesson at the other's slot, the two of them set aside.
  const both = [first.id, second.id];
  for (const [lesson, slot] of [
    [first, second.time_slot_id],
    [second, first.time_slot_id],
  ] as const) {
    const checked = await checkBooking(supabase, actor, bookingAt(lesson, slot), both);
    if (!checked?.ok) return checked ?? { ok: false, error: "generic" };
  }

  const { error } = await supabase.rpc("swap_lessons", { p_a: first.id, p_b: second.id });
  if (error) return { ok: false, error: dbErrorKey(error, SWAP_CONSTRAINTS) };

  await logAudit({
    actorId: actor.id,
    schoolId: actor.schoolId,
    action: "lesson.swap",
    entity: "lesson",
    entityId: first.id,
    data: {
      lesson_a: first.id,
      lesson_b: second.id,
      slot_a: first.time_slot_id,
      slot_b: second.time_slot_id,
    },
  });
  return { ok: true, data: null };
}
