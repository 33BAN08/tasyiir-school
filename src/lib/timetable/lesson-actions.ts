"use server";

import { logAudit } from "@/lib/audit";
import { getSchoolActor, type SchoolActor } from "@/lib/auth/school-actor";
import { dbErrorKey } from "@/lib/structure/db-errors";
import { createClient } from "@/lib/supabase/server";
import { lessonDetailsSchema, lessonIdSchema, newLessonSchema } from "@/lib/validations/timetable";

import { CONSTRAINTS, checkBooking, type Booking, type LessonActionResult, type LessonField } from "./lesson-checks";

// Lessons are school data: written with the caller's session through RLS
// (own school + timetable module + timetable.manage). The database refuses
// double bookings, breaks and a teacher who does not teach the subject; these
// actions check the same things first to say WHO is busy WHERE, in the UI
// language. Error keys are under `timetable.errors`.

function firstIssue(issues: { message: string; path: PropertyKey[] }[]): { error: string; field?: LessonField } {
  const issue = issues[0];
  const field = issue?.path[0];
  return {
    error: issue?.message ?? "generic",
    field: field === "subjectId" || field === "teacherId" || field === "roomId" ? field : undefined,
  };
}

/** Adds a lesson to an empty cell (class + time slot). */
export async function createLesson(input: unknown): Promise<LessonActionResult<{ id: string }>> {
  const actor = await getSchoolActor("timetable.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const parsed = newLessonSchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...firstIssue(parsed.error.issues) };
  const v = parsed.data;

  const supabase = await createClient();
  const checked = await checkBooking(supabase, actor, v);
  if (!checked?.ok) return checked ?? { ok: false, error: "generic" };

  const { data, error } = await supabase
    .from("lessons")
    .insert({
      school_id: actor.schoolId,
      academic_year_id: checked.data.academicYearId,
      time_slot_id: v.timeSlotId,
      class_id: v.classId,
      subject_id: v.subjectId,
      teacher_id: v.teacherId,
      room_id: v.roomId || null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: dbErrorKey(error, CONSTRAINTS) };

  await audit(actor, "lesson.create", data.id, v);
  return { ok: true, data: { id: data.id } };
}

/** Changes a lesson's subject, teacher or room (its cell stays the same). */
export async function updateLesson(lessonId: unknown, input: unknown): Promise<LessonActionResult<null>> {
  const actor = await getSchoolActor("timetable.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = lessonIdSchema.safeParse(lessonId);
  if (!id.success) return { ok: false, error: "notFound" };
  const parsed = lessonDetailsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...firstIssue(parsed.error.issues) };
  const v = parsed.data;

  const supabase = await createClient();
  const { data: lesson } = await supabase
    .from("lessons")
    .select("class_id, time_slot_id")
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .maybeSingle();
  if (!lesson) return { ok: false, error: "notFound" };

  const checked = await checkBooking(supabase, actor, { ...v, classId: lesson.class_id, timeSlotId: lesson.time_slot_id }, [id.data]);
  if (!checked?.ok) return checked ?? { ok: false, error: "generic" };

  const { data, error } = await supabase
    .from("lessons")
    .update({ subject_id: v.subjectId, teacher_id: v.teacherId, room_id: v.roomId || null })
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .select("id");
  if (error) return { ok: false, error: dbErrorKey(error, CONSTRAINTS) };
  if (data.length === 0) return { ok: false, error: "notFound" };

  await audit(actor, "lesson.update", id.data, { ...v, classId: lesson.class_id, timeSlotId: lesson.time_slot_id });
  return { ok: true, data: null };
}

export async function deleteLesson(lessonId: unknown): Promise<LessonActionResult<null>> {
  const actor = await getSchoolActor("timetable.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = lessonIdSchema.safeParse(lessonId);
  if (!id.success) return { ok: false, error: "notFound" };

  const { data, error } = await (await createClient())
    .from("lessons")
    .delete()
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .select("class_id, time_slot_id");
  if (error) return { ok: false, error: dbErrorKey(error, CONSTRAINTS) };
  if (data.length === 0) return { ok: false, error: "notFound" };

  await logAudit({
    actorId: actor.id,
    schoolId: actor.schoolId,
    action: "lesson.delete",
    entity: "lesson",
    entityId: id.data,
    data: { class_id: data[0].class_id, time_slot_id: data[0].time_slot_id },
  });
  return { ok: true, data: null };
}

function audit(actor: SchoolActor, action: string, lessonId: string, v: Booking) {
  return logAudit({
    actorId: actor.id,
    schoolId: actor.schoolId,
    action,
    entity: "lesson",
    entityId: lessonId,
    data: {
      class_id: v.classId,
      time_slot_id: v.timeSlotId,
      subject_id: v.subjectId,
      teacher_id: v.teacherId,
      room_id: v.roomId || null,
    },
  });
}
