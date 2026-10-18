import "server-only";

import { absenceState, type JustificationState } from "@/lib/justifications/coverage";
import type { AcademicYear } from "@/lib/structure/academic-years";
import type { SubjectColor } from "@/lib/structure/subject-template";
import { shortTime } from "@/lib/structure/time-slot-template";
import type { StudentNames } from "@/lib/students/names";
import { createClient } from "@/lib/supabase/server";

import { schoolTime } from "./clock";
import type { MarkStatus } from "./types";

// Staff reads (attendance.view / .manage read the whole school through RLS):
// one class on one day — its lessons of that weekday and the attendance taken.
// Sessions keep a snapshot, so a session whose lesson was moved or deleted is
// still shown, with the class, subject, teacher and hours it had.

export type DayMark = StudentNames & {
  studentId: string;
  status: MarkStatus;
  minutesLate: number | null;
  note: string | null;
  /** Whether an approved / pending / rejected justification covers it. */
  state: JustificationState;
};

export type DayLesson = {
  key: string;
  /** Null for a session whose lesson was deleted (it can still be read, not corrected). */
  lessonId: string | null;
  start: string;
  end: string;
  subjectName: string;
  subjectColor: SubjectColor;
  teacherName: string;
  session: {
    id: string;
    takenAt: string;
    updatedAt: string | null;
    /** Taken by the lesson's teacher (else by staff). */
    byTeacher: boolean;
    marks: DayMark[];
  } | null;
};

export type ClassDay = { lessons: DayLesson[]; studentCount: number };

/** "yyyy-MM-dd" → 1 = Monday … 7 = Sunday (calendar arithmetic, no time zone involved). */
export function weekdayOf(date: string): number {
  return ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
}

/** The academic year whose dates contain `date`, if any. */
export function yearOf(years: AcademicYear[], date: string): AcademicYear | undefined {
  return years.find((y) => y.startDate <= date && date <= y.endDate);
}

type SessionRow = {
  id: string;
  lesson_id: string | null;
  start_time: string;
  end_time: string;
  teacher_id: string;
  taken_by: string;
  taken_at: string;
  updated_at: string;
  subject: { name: string; color: string } | null;
  marks: {
    student_id: string;
    status: string;
    minutes_late: number | null;
    note: string | null;
    student: { first_name: string; last_name: string; first_name_ar: string | null; last_name_ar: string | null } | null;
  }[];
};

type LessonRow = {
  id: string;
  teacher_id: string;
  slot: { day_of_week: number; start_time: string; end_time: string } | null;
  subject: { name: string; color: string } | null;
};

/** One class on one day: its lessons of that weekday (that year) and every attendance session of the day. */
export async function getClassDay(schoolId: string, classId: string, yearId: string, date: string): Promise<ClassDay> {
  const supabase = await createClient();
  const [lessons, sessions, teachers, enrolled] = await Promise.all([
    supabase
      .from("lessons")
      .select("id, teacher_id, slot:time_slots(day_of_week, start_time, end_time), subject:subjects(name, color)")
      .eq("school_id", schoolId)
      .eq("class_id", classId)
      .eq("academic_year_id", yearId)
      .overrideTypes<LessonRow[], { merge: false }>(),
    supabase
      .from("attendance_sessions")
      .select(
        "id, lesson_id, start_time, end_time, teacher_id, taken_by, taken_at, updated_at, subject:subjects(name, color), " +
          "marks:attendance_marks(student_id, status, minutes_late, note, student:students(first_name, last_name, first_name_ar, last_name_ar))",
      )
      .eq("school_id", schoolId)
      .eq("class_id", classId)
      .eq("session_date", date)
      .overrideTypes<SessionRow[], { merge: false }>(),
    supabase.rpc("timetable_teachers", { p_year: yearId }),
    supabase.from("student_enrollments").select("student_id", { count: "exact", head: true }).eq("class_id", classId),
  ]);
  if (lessons.error || sessions.error) throw new Error("getClassDay failed");
  const teacherName = new Map((teachers.data ?? []).map((t) => [t.id, t.full_name]));

  // Justifications covering this day for the students marked (a 'days' one by its dates, a 'mark' one by its session).
  const markedIds = [...new Set(sessions.data.flatMap((s) => s.marks.map((m) => m.student_id)))];
  const covering = markedIds.length
    ? await supabase
        .from("justifications")
        .select("student_id, kind, status, from_date, to_date, session_id")
        .eq("school_id", schoolId)
        .in("student_id", markedIds)
        .lte("from_date", date)
        .gte("to_date", date)
    : { data: [], error: null };
  if (covering.error) throw new Error("getClassDay failed");
  const stateOf = (studentId: string, sessionId: string): JustificationState =>
    absenceState(
      { sessionId, date },
      (covering.data ?? [])
        .filter((j) => j.student_id === studentId)
        .map((j) => ({
          kind: j.kind as "days" | "mark",
          status: j.status as "pending" | "approved" | "rejected",
          fromDate: j.from_date,
          toDate: j.to_date,
          sessionId: j.session_id,
        })),
    );

  const toSession = async (s: SessionRow): Promise<NonNullable<DayLesson["session"]>> => {
    const [takenAt, updatedAt] = await Promise.all([schoolTime(s.taken_at), schoolTime(s.updated_at)]);
    return {
      id: s.id,
      takenAt: takenAt ?? "",
      updatedAt: updatedAt !== takenAt ? updatedAt : null,
      byTeacher: s.taken_by === s.teacher_id,
      marks: s.marks
        .map((m) => ({
          studentId: m.student_id,
          firstName: m.student?.first_name ?? "",
          lastName: m.student?.last_name ?? "",
          firstNameAr: m.student?.first_name_ar ?? null,
          lastNameAr: m.student?.last_name_ar ?? null,
          status: m.status as MarkStatus,
          minutesLate: m.minutes_late,
          note: m.note,
          state: stateOf(m.student_id, s.id),
        }))
        .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)),
    };
  };

  const weekday = weekdayOf(date);
  const sessionOf = new Map(sessions.data.filter((s) => s.lesson_id).map((s) => [s.lesson_id, s]));
  const todays = lessons.data.filter((l) => l.slot?.day_of_week === weekday);
  const rows: DayLesson[] = await Promise.all([
    ...todays.map(async (l) => {
      const s = sessionOf.get(l.id);
      return {
        key: l.id,
        lessonId: l.id,
        start: shortTime(l.slot?.start_time ?? ""),
        end: shortTime(l.slot?.end_time ?? ""),
        subjectName: l.subject?.name ?? "",
        subjectColor: (l.subject?.color ?? "slate") as SubjectColor,
        // The session keeps who taught then; the lesson may have changed teacher since.
        teacherName: teacherName.get(s?.teacher_id ?? l.teacher_id) ?? "",
        session: s ? await toSession(s) : null,
      };
    }),
    // Sessions whose lesson was moved to another day or deleted: shown from their snapshot.
    ...sessions.data
      .filter((s) => !s.lesson_id || !todays.some((l) => l.id === s.lesson_id))
      .map(async (s) => ({
        key: s.id,
        // A moved lesson keeps its link (still correctable); a deleted one has none.
        lessonId: s.lesson_id,
        start: shortTime(s.start_time),
        end: shortTime(s.end_time),
        subjectName: s.subject?.name ?? "",
        subjectColor: (s.subject?.color ?? "slate") as SubjectColor,
        teacherName: teacherName.get(s.teacher_id) ?? "",
        session: await toSession(s),
      })),
  ]);
  return {
    lessons: rows.sort((a, b) => a.start.localeCompare(b.start)),
    studentCount: enrolled.count ?? 0,
  };
}
