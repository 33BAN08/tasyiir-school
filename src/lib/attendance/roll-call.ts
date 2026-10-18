import "server-only";

import { shortTime } from "@/lib/structure/time-slot-template";
import type { SubjectColor } from "@/lib/structure/subject-template";
import { getCurrentYear } from "@/lib/students/students";
import { createClient } from "@/lib/supabase/server";

import { schoolTime, type SchoolClock } from "./clock";
import type { MarkStatus, RollCallMark } from "./types";

// Reads for the teacher's roll call and lesson pages, with the teacher's own
// session: RLS returns only their lessons, the students of their classes this
// year, and their own attendance sessions. The explicit filters are a second fence.

export type TodayLesson = {
  id: string;
  /** 1 = Monday … 6 = Saturday. */
  day: number;
  start: string;
  end: string;
  className: string;
  subjectName: string;
  subjectColor: SubjectColor;
  roomName: string | null;
  /** "HH:MM" attendance was first taken today, null when not yet. */
  takenAt: string | null;
};

type Supabase = Awaited<ReturnType<typeof createClient>>;
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

function toLesson(row: LessonRow, takenAt: string | null = null): TodayLesson {
  return {
    id: row.id,
    day: row.slot?.day_of_week ?? 0,
    start: shortTime(row.slot?.start_time ?? ""),
    end: shortTime(row.slot?.end_time ?? ""),
    className: row.class?.name ?? "",
    subjectName: row.subject?.name ?? "",
    subjectColor: (row.subject?.color ?? "slate") as SubjectColor,
    roomName: row.room?.name ?? null,
    takenAt,
  };
}

/** "yyyy-MM-dd" + n days (calendar arithmetic on the date itself, no time zone involved). */
function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export type TeacherDays = {
  /** Today's lessons in time order, with today's attendance state. */
  today: TodayLesson[];
  /** The next day with lessons (tomorrow at the earliest): a preview, attendance opens that day. */
  next: { day: number; date: string; lessons: TodayLesson[] } | null;
};

/** The teacher's lessons of the current year: today's, and the next school day's. */
export async function getTeacherDays(schoolId: string, teacherId: string, clock: SchoolClock): Promise<TeacherDays> {
  const year = await getCurrentYear(schoolId);
  if (!year) return { today: [], next: null };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lessons")
    .select(LESSON_FIELDS)
    .eq("school_id", schoolId)
    .eq("academic_year_id", year.id)
    .eq("teacher_id", teacherId)
    .overrideTypes<LessonRow[], { merge: false }>();
  if (error) throw new Error("getTeacherDays failed");
  const ofDay = (day: number) =>
    data.filter((l) => l.slot?.day_of_week === day).sort((a, b) => (a.slot?.start_time ?? "").localeCompare(b.slot?.start_time ?? ""));

  let next: TeacherDays["next"] = null;
  for (let ahead = 1; ahead <= 7 && !next; ahead++) {
    const day = ((clock.weekday - 1 + ahead) % 7) + 1;
    const lessons = ofDay(day);
    if (lessons.length > 0) next = { day, date: addDays(clock.date, ahead), lessons: lessons.map((l) => toLesson(l)) };
  }

  const today = clock.weekday <= 6 ? ofDay(clock.weekday) : [];
  if (today.length === 0) return { today: [], next };
  const { data: sessions } = await supabase
    .from("attendance_sessions")
    .select("lesson_id, taken_at")
    .eq("school_id", schoolId)
    .eq("session_date", clock.date)
    .in("lesson_id", today.map((l) => l.id));
  const takenAt = new Map(
    await Promise.all((sessions ?? []).map(async (s) => [s.lesson_id, await schoolTime(s.taken_at)] as const)),
  );
  return { today: today.map((row) => toLesson(row, takenAt.get(row.id) ?? null)), next };
}

export type RollCallStudent = {
  id: string;
  firstName: string;
  lastName: string;
  firstNameAr: string | null;
  lastNameAr: string | null;
  photoPath: string | null;
};

async function teacherLesson(supabase: Supabase, schoolId: string, teacherId: string, lessonId: string) {
  const { data } = await supabase
    .from("lessons")
    .select(LESSON_FIELDS)
    .eq("school_id", schoolId)
    .eq("teacher_id", teacherId)
    .eq("id", lessonId)
    .maybeSingle()
    .overrideTypes<LessonRow | null, { merge: false }>();
  return data;
}

/** The students enrolled in a class that year, by last then first name. */
async function classStudents(supabase: Supabase, schoolId: string, row: LessonRow): Promise<RollCallStudent[]> {
  const { data, error } = await supabase
    .from("student_enrollments")
    .select("student:students(id, first_name, last_name, first_name_ar, last_name_ar, photo_path)")
    .eq("school_id", schoolId)
    .eq("class_id", row.class_id)
    .eq("academic_year_id", row.academic_year_id);
  if (error) throw new Error("classStudents failed");
  return data
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
}

export type LessonClass = {
  lesson: TodayLesson;
  students: RollCallStudent[];
  /** A lesson of the current year on today's weekday: attendance can be taken now. */
  isToday: boolean;
};

/** One of the teacher's lessons (any day) with its class list; null when not theirs / not found. */
export async function getLessonClass(schoolId: string, teacherId: string, lessonId: string, clock: SchoolClock): Promise<LessonClass | null> {
  const supabase = await createClient();
  const row = await teacherLesson(supabase, schoolId, teacherId, lessonId);
  if (!row) return null;
  const [year, students] = await Promise.all([getCurrentYear(schoolId), classStudents(supabase, schoolId, row)]);
  return {
    lesson: toLesson(row),
    students,
    isToday: row.slot?.day_of_week === clock.weekday && row.academic_year_id === year?.id,
  };
}

export type RollCall = LessonClass & {
  marks: Record<string, RollCallMark>;
  takenAt: string | null;
  updatedAt: string | null;
};

/** One of the teacher's lessons with its class list and today's marks; null when not theirs / not found. */
export async function getRollCall(schoolId: string, teacherId: string, lessonId: string, clock: SchoolClock): Promise<RollCall | null> {
  const supabase = await createClient();
  const row = await teacherLesson(supabase, schoolId, teacherId, lessonId);
  if (!row) return null;

  const [year, students, session] = await Promise.all([
    getCurrentYear(schoolId),
    classStudents(supabase, schoolId, row),
    supabase
      .from("attendance_sessions")
      .select("id, taken_at, updated_at, marks:attendance_marks(student_id, status, minutes_late)")
      .eq("school_id", schoolId)
      .eq("lesson_id", lessonId)
      .eq("session_date", clock.date)
      .maybeSingle(),
  ]);
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
