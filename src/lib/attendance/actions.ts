"use server";

import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { areaFor } from "@/lib/auth/roles";
import { blockedPath, getCurrentUser } from "@/lib/auth/session";
import { dbErrorKey } from "@/lib/structure/db-errors";
import { createClient } from "@/lib/supabase/server";
import { rollCallMarksSchema } from "@/lib/validations/attendance";

import { schoolClock, schoolTime } from "./clock";

// The roll call: saved with the caller's session, so the database decides
// (save_attendance + RLS): a teacher only their own lesson, today; staff with
// attendance.manage any lesson. "Today" is the database's (Africa/Casablanca).
// Error keys are under `attendance.errors`.

export type RollCallResult =
  | { ok: true; data: { takenAt: string; updatedAt: string | null } }
  | { ok: false; error: string };

const DB_ERRORS = {
  attendance_lesson_not_found: "notFound",
  attendance_lesson_required: "notFound",
  attendance_wrong_day: "notToday",
  attendance_future: "notToday",
  attendance_outside_year: "notToday",
  attendance_student_not_in_class: "studentNotInClass",
  attendance_forbidden: "forbidden",
  attendance_marks_minutes_check: "minutes",
};

/** Saves today's roll call of a lesson: `marks` = the absent / late students (everyone else present). */
export async function saveRollCall(lessonId: unknown, marks: unknown): Promise<RollCallResult> {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword || blockedPath(user) || !user.schoolId || areaFor(user) !== "school") {
    return { ok: false, error: "forbidden" };
  }
  const id = z.uuid().safeParse(lessonId);
  if (!id.success) return { ok: false, error: "notFound" };
  const parsed = rollCallMarksSchema.safeParse(marks);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" };

  const supabase = await createClient();
  const clock = await schoolClock();
  const { data: sessionId, error } = await supabase.rpc("save_attendance", {
    p_lesson: id.data,
    p_date: clock.date,
    p_marks: parsed.data.map((m) => ({ student_id: m.studentId, status: m.status, minutes_late: m.minutesLate })),
  });
  if (error) return { ok: false, error: dbErrorKey(error, DB_ERRORS) };

  const { data: session } = await supabase
    .from("attendance_sessions")
    .select("taken_at, updated_at")
    .eq("id", sessionId)
    .single();
  const [takenAt, updatedAt] = await Promise.all([schoolTime(session?.taken_at), schoolTime(session?.updated_at)]);

  await logAudit({
    actorId: user.id,
    schoolId: user.schoolId,
    action: "attendance.save",
    entity: "attendance_session",
    entityId: sessionId,
    data: {
      lesson_id: id.data,
      date: clock.date,
      absent: parsed.data.filter((m) => m.status === "absent").length,
      late: parsed.data.filter((m) => m.status === "late").length,
    },
  });
  return { ok: true, data: { takenAt: takenAt ?? clock.time, updatedAt: updatedAt !== takenAt ? updatedAt : null } };
}
