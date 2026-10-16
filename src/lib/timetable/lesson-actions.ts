"use server";

import { logAudit } from "@/lib/audit";
import { getSchoolActor, type SchoolActor } from "@/lib/auth/school-actor";
import { dbErrorKey } from "@/lib/structure/db-errors";
import { shortTime } from "@/lib/structure/time-slot-template";
import { createClient } from "@/lib/supabase/server";
import {
  lessonDetailsSchema,
  lessonIdSchema,
  newLessonSchema,
  type LessonDetailsValues,
} from "@/lib/validations/timetable";

import type { LessonConflict } from "./types";

// Lessons are school data: written with the caller's session through RLS
// (own school + timetable module + timetable.manage). The database refuses
// double bookings, breaks and a teacher who does not teach the subject; these
// actions check the same things first to say WHO is busy WHERE, in the UI
// language. Error keys are under `timetable.errors`.

type LessonField = "subjectId" | "teacherId" | "roomId";
export type LessonActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; field?: LessonField; conflict?: LessonConflict };

// When two people book at the same moment, only the database sees it.
const CONSTRAINTS = {
  lessons_class_slot_key: "slotTaken",
  lessons_teacher_slot_key: "teacherBusyNow",
  lessons_room_slot_key: "roomBusyNow",
  lessons_teacher_subject_fkey: "teacherNotForSubject",
  lessons_time_slot_fkey: "slotNotBookable",
  lessons_room_fkey: "roomNotFound",
};

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Booking = LessonDetailsValues & { classId: string; timeSlotId: string };

/** Checks a booking against the slot, the teacher's subjects and the other lessons of that slot. */
async function checkBooking(
  supabase: Supabase,
  actor: SchoolActor,
  booking: Booking,
  ignoreLessonId?: string,
): Promise<LessonActionResult<{ academicYearId: string }> | null> {
  const { data: slot } = await supabase
    .from("time_slots")
    .select("academic_year_id, day_of_week, start_time, end_time, kind")
    .eq("id", booking.timeSlotId)
    .eq("school_id", actor.schoolId)
    .maybeSingle();
  if (!slot) return { ok: false, error: "notFound" };
  if (slot.kind !== "lesson") return { ok: false, error: "slotNotBookable" };

  const [klass, teaches, others] = await Promise.all([
    supabase
      .from("classes")
      .select("id")
      .eq("id", booking.classId)
      .eq("school_id", actor.schoolId)
      .eq("academic_year_id", slot.academic_year_id)
      .maybeSingle(),
    supabase
      .from("teacher_subjects")
      .select("teacher_id")
      .eq("school_id", actor.schoolId)
      .eq("teacher_id", booking.teacherId)
      .eq("subject_id", booking.subjectId)
      .maybeSingle(),
    supabase
      .from("lessons")
      .select("id, class_id, teacher_id, room_id, class:classes(name)")
      .eq("school_id", actor.schoolId)
      .eq("time_slot_id", booking.timeSlotId),
  ]);
  if (!klass.data) return { ok: false, error: "notFound" };
  if (!teaches.data) return { ok: false, error: "teacherNotForSubject", field: "teacherId" };
  if (others.error) return { ok: false, error: dbErrorKey(others.error) };

  const when = { day: slot.day_of_week, start: shortTime(slot.start_time), end: shortTime(slot.end_time) };
  const busy = others.data.filter((l) => l.id !== ignoreLessonId);
  const sameClass = busy.find((l) => l.class_id === booking.classId);
  if (sameClass) {
    return { ok: false, error: "classBusy", conflict: { kind: "class", name: "", className: sameClass.class?.name ?? "", ...when } };
  }
  const sameTeacher = busy.find((l) => l.teacher_id === booking.teacherId);
  if (sameTeacher) {
    const { data } = await supabase.rpc("timetable_teachers", { p_year: slot.academic_year_id });
    const name = data?.find((t) => t.id === booking.teacherId)?.full_name ?? "";
    return {
      ok: false,
      error: "teacherBusy",
      field: "teacherId",
      conflict: { kind: "teacher", name, className: sameTeacher.class?.name ?? "", ...when },
    };
  }
  const sameRoom = booking.roomId ? busy.find((l) => l.room_id === booking.roomId) : undefined;
  if (sameRoom) {
    const { data } = await supabase.from("rooms").select("name").eq("id", booking.roomId).maybeSingle();
    return {
      ok: false,
      error: "roomBusy",
      field: "roomId",
      conflict: { kind: "room", name: data?.name ?? "", className: sameRoom.class?.name ?? "", ...when },
    };
  }
  return { ok: true, data: { academicYearId: slot.academic_year_id } };
}

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

  const checked = await checkBooking(supabase, actor, { ...v, classId: lesson.class_id, timeSlotId: lesson.time_slot_id }, id.data);
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
