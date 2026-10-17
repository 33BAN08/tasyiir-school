import "server-only";

import type { SchoolActor } from "@/lib/auth/school-actor";
import { dbErrorKey } from "@/lib/structure/db-errors";
import { shortTime } from "@/lib/structure/time-slot-template";
import type { createClient } from "@/lib/supabase/server";
import type { LessonDetailsValues } from "@/lib/validations/timetable";

import { findClash } from "./clash";
import type { LessonActionResult } from "./types";

// The checks the lesson Server Actions make before writing (add, change, move,
// swap). Kept out of the "use server" files: everything exported from those is
// callable from the browser.

// When two people book at the same moment, only the database sees it.
export const LESSON_CONSTRAINTS = {
  lessons_class_slot_key: "slotTaken",
  lessons_teacher_slot_key: "teacherBusyNow",
  lessons_room_slot_key: "roomBusyNow",
  lessons_teacher_subject_fkey: "teacherNotForSubject",
  lessons_time_slot_fkey: "slotNotBookable",
  lessons_room_fkey: "roomNotFound",
  swap_lessons_not_found: "notFound",
  swap_lessons_other_year: "notFound",
};

export type Supabase = Awaited<ReturnType<typeof createClient>>;
export type Booking = LessonDetailsValues & { classId: string; timeSlotId: string };

type Options = {
  /** Lessons that leave the slot in the same change (the lesson itself, a swap partner). */
  ignore?: string[];
  /** A move: a busy teacher is not "choose another teacher". */
  moving?: boolean;
};

/** Checks a booking against the slot, the teacher's subjects and the other lessons of that slot. */
export async function checkBooking(
  supabase: Supabase,
  actor: SchoolActor,
  booking: Booking,
  { ignore = [], moving = false }: Options = {},
): Promise<LessonActionResult<{ academicYearId: string }>> {
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

  const atSlot = others.data.map((l) => ({
    id: l.id,
    classId: l.class_id,
    teacherId: l.teacher_id,
    roomId: l.room_id,
    className: l.class?.name ?? "",
  }));
  const clash = findClash({ ...booking, roomId: booking.roomId || null }, atSlot, ignore);
  if (!clash) return { ok: true, data: { academicYearId: slot.academic_year_id } };

  const when = { day: slot.day_of_week, start: shortTime(slot.start_time), end: shortTime(slot.end_time) };
  const className = clash.lesson.className;
  if (clash.kind === "class") {
    return { ok: false, error: "classBusy", conflict: { kind: "class", name: "", className, ...when } };
  }
  if (clash.kind === "teacher") {
    const { data } = await supabase.rpc("timetable_teachers", { p_year: slot.academic_year_id });
    const name = data?.find((t) => t.id === booking.teacherId)?.full_name ?? "";
    return {
      ok: false,
      error: moving ? "teacherBusyMove" : "teacherBusy",
      field: "teacherId",
      conflict: { kind: "teacher", name, className, ...when },
    };
  }
  const { data } = await supabase.from("rooms").select("name").eq("id", booking.roomId).maybeSingle();
  return {
    ok: false,
    error: "roomBusy",
    field: "roomId",
    conflict: { kind: "room", name: data?.name ?? "", className, ...when },
  };
}
