import "server-only";

import { shortTime } from "@/lib/structure/time-slot-template";
import type { SubjectColor } from "@/lib/structure/subject-template";
import { getCurrentYear } from "@/lib/students/students";
import { createClient } from "@/lib/supabase/server";

import { schoolTime, type SchoolClock } from "./clock";
import type { MarkStatus, RollCallMark } from "./types";

// Reads for the teacher's roll call, with the teacher's own session: RLS
// returns only their lessons, the students of their classes this year, and
// their own attendance sessions. The explicit filters are a second fence.


export type TodayLesson = {
  id: string;
  start: string;
  end: string;
  className: string;
  subjectName: string;
  subjectColor: SubjectColor;
  roomName: string | null;
  /** "HH:MM" attendance was first taken today, null when not yet. */
  takenAt: string | null;
};

type LessonRow = {
  id: string;
  class_id: string;
  academic_year_id: string;
  slot: { day_of_week: number; start_time: string; end_time: string } | null;
  class: { name: string } | null;
  subject: { name: string; color: string } | null;
  room: { name: string } | null;
};

const LESSON_FIELDS =
  "id, class_id, academic_year_id, slot:time_slots(day_of_week, start_time, end_time), class:classes(name), subject:subjects(name, color), room:rooms(name)";

function toLesson(row: LessonRow, takenAt: string | null): TodayLesson {
  return {
    id: row.id,
    start: shortTime(row.slot?.start_time ?? ""),
    end: shortTime(row.slot?.end_time ?? ""),
    className: row.class?.name ?? "",
    subjectName: row.subject?.name ?? "",
    subjectColor: (row.subject?.color ?? "slate") as SubjectColor,
    roomName: row.room?.name ?? null,
    takenAt,
  };
}

/** The teacher's lessons of the current year on today's weekday, in time order, with today's attendance state. */
export async function getTodayLessons(schoolId: string, teacherId: string, clock: SchoolClock): Promise<TodayLesson[]> {
  const year = await getCurrentYear(schoolId);
  if (!year || clock.weekday > 6) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lessons")
    .select(LESSON_FIELDS)
    .eq("school_id", schoolId)
    .eq("academic_year_id", year.id)
    .eq("teacher_id", teacherId)
    .overrideTypes<LessonRow[], { merge: false }>();
  if (error) throw new Error("getTodayLessons failed");
  const today = data.filter((l) => l.slot?.day_of_week === clock.weekday);
  if (today.length === 0) return [];

  const { data: sessions } = await supabase
    .from("attendance_sessions")
    .select("lesson_id, taken_at")
    .eq("school_id", schoolId)
    .eq("session_date", clock.date)
    .in("lesson_id", today.map((l) => l.id));
  const takenAt = new Map(
    await Promise.all((sessions ?? []).map(async (s) => [s.lesson_id, await schoolTime(s.taken_at)] as const)),
  );
  return today
    .map((row) => toLesson(row, takenAt.get(row.id) ?? null))
    .sort((a, b) => a.start.localeCompare(b.start));
}

export type RollCallStudent = {
  id: string;
  firstName: string;
  lastName: string;
  firstNameAr: string | null;
  lastNameAr: string | null;
  photoPath: string | null;
};

export type RollCall = {
  lesson: TodayLesson;
  /** A lesson of the current year on today's weekday: attendance can be taken. */
  isToday: boolean;
  students: RollCallStudent[];
  marks: Record<string, RollCallMark>;
  takenAt: string | null;
  updatedAt: string | null;
};

/** One of the teacher's lessons with its class list and today's marks; null when not theirs / not found. */
export async function getRollCall(schoolId: string, teacherId: string, lessonId: string, clock: SchoolClock): Promise<RollCall | null> {
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("lessons")
    .select(LESSON_FIELDS)
    .eq("school_id", schoolId)
    .eq("teacher_id", teacherId)
    .eq("id", lessonId)
    .maybeSingle()
    .overrideTypes<LessonRow | null, { merge: false }>();
  if (!row) return null;

  const [year, enrolled, session] = await Promise.all([
    getCurrentYear(schoolId),
    supabase
      .from("student_enrollments")
      .select("student:students(id, first_name, last_name, first_name_ar, last_name_ar, photo_path)")
      .eq("school_id", schoolId)
      .eq("class_id", row.class_id)
      .eq("academic_year_id", row.academic_year_id),
    supabase
      .from("attendance_sessions")
      .select("id, taken_at, updated_at, marks:attendance_marks(student_id, status, minutes_late)")
      .eq("school_id", schoolId)
      .eq("lesson_id", lessonId)
      .eq("session_date", clock.date)
      .maybeSingle(),
  ]);
  if (enrolled.error) throw new Error("getRollCall failed");

  const students = enrolled.data
    .flatMap((e) => (e.student ? [e.student] : []))
    .map((s) => ({
      id: s.id,
      firstName: s.first_name,
      lastName: s.last_name,
      firstNameAr: s.first_name_ar,
      lastNameAr: s.last_name_ar,
      photoPath: s.photo_path,
    }))
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  const marks: Record<string, RollCallMark> = {};
  for (const m of session.data?.marks ?? []) {
    marks[m.student_id] = { status: m.status as MarkStatus, minutesLate: m.minutes_late };
  }
  const [takenAt, updatedAt] = await Promise.all([schoolTime(session.data?.taken_at), schoolTime(session.data?.updated_at)]);

  return {
    lesson: toLesson(row, takenAt),
    isToday: row.slot?.day_of_week === clock.weekday && row.academic_year_id === year?.id,
    students,
    marks,
    takenAt,
    updatedAt: updatedAt !== takenAt ? updatedAt : null,
  };
}
