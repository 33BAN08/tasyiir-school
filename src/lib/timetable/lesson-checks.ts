import "server-only";

import type { SchoolActor } from "@/lib/auth/school-actor";
import { dbErrorKey } from "@/lib/structure/db-errors";
import { shortTime } from "@/lib/structure/time-slot-template";
import type { createClient } from "@/lib/supabase/server";
import type { LessonDetailsValues } from "@/lib/validations/timetable";

import type { LessonConflict } from "./types";

// What the lesson Server Actions share (lesson-actions.ts, move-actions.ts).
// Kept out of the "use server" files: an exported function there becomes a
// callable action.

export type LessonField = "subjectId" | "teacherId" | "roomId";
export type LessonActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; field?: LessonField; conflict?: LessonConflict };

// When two people book at the same moment, only the database sees it.
export const CONSTRAINTS = {
  lessons_class_slot_key: "slotTaken",
  lessons_teacher_slot_key: "teacherBusyNow",
  lessons_room_slot_key: "roomBusyNow",
  lessons_teacher_subject_fkey: "teacherNotForSubject",
  lessons_time_slot_fkey: "slotNotBookable",
  lessons_room_fkey: "roomNotFound",
};

export type Supabase = Awaited<ReturnType<typeof createClient>>;
export type Booking = LessonDetailsValues & { classId: string; timeSlotId: string };

/** Checks a booking against the slot, the teacher's subjects and the other lessons of that slot. */
export async function checkBooking(
  supabase: Supabase,
  actor: SchoolActor,
  booking: Booking,
  ignoreLessonIds: string[] = [],
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
  const busy = others.data.filter((l) => !ignoreLessonIds.includes(l.id));
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

