import "server-only";

import type { SubjectColor } from "@/lib/structure/subject-template";
import { shortTime } from "@/lib/structure/time-slot-template";
import type { StudentNames } from "@/lib/students/names";
import { readAll } from "@/lib/supabase/read-all";
import { createClient } from "@/lib/supabase/server";
import { slotMinutes } from "@/lib/timetable/hours";

import type { MarkStatus } from "./types";

// History and totals for staff (attendance.view / .manage read the whole
// school through RLS). An absence counts the session's length (Massar counts
// hours); a late arrival counts its minutes when they were given.

export type AttendanceTotals = {
  absences: number;
  /** Total length of the missed sessions, in minutes. */
  absentMinutes: number;
  lates: number;
  /** Sum of the minutes given for late arrivals (some may have none). */
  lateMinutes: number;
};

export type HistoryMark = {
  date: string;
  start: string;
  end: string;
  classId: string;
  subjectName: string;
  subjectColor: SubjectColor;
  status: MarkStatus;
  minutesLate: number | null;
  note: string | null;
};

type MarkRow = {
  student_id: string;
  status: string;
  minutes_late: number | null;
  note: string | null;
  session: {
    session_date: string;
    start_time: string;
    end_time: string;
    class_id: string;
    subject: { name: string; color: string } | null;
  } | null;
};

const MARK_FIELDS =
  "student_id, status, minutes_late, note, session:attendance_sessions!inner(session_date, start_time, end_time, class_id, subject:subjects(name, color))";

export const emptyTotals = (): AttendanceTotals => ({ absences: 0, absentMinutes: 0, lates: 0, lateMinutes: 0 });

function add(totals: AttendanceTotals, row: MarkRow): void {
  if (!row.session) return;
  if (row.status === "absent") {
    totals.absences += 1;
    totals.absentMinutes += slotMinutes({ startTime: shortTime(row.session.start_time), endTime: shortTime(row.session.end_time) });
  } else {
    totals.lates += 1;
    totals.lateMinutes += row.minutes_late ?? 0;
  }
}

/** A student's absences and late arrivals between two dates (inclusive), most recent first, with totals. */
export async function getStudentAttendance(
  schoolId: string,
  studentId: string,
  from: string,
  to: string,
): Promise<{ totals: AttendanceTotals; marks: HistoryMark[] }> {
  const supabase = await createClient();
  const data = await readAll(
    (rangeFrom, rangeTo) =>
      supabase
        .from("attendance_marks")
        .select(MARK_FIELDS)
        .eq("school_id", schoolId)
        .eq("student_id", studentId)
        .gte("session.session_date", from)
        .lte("session.session_date", to)
        .order("session_id")
        .order("student_id")
        .range(rangeFrom, rangeTo)
        .overrideTypes<MarkRow[], { merge: false }>(),
    "getStudentAttendance",
  );

  const totals = emptyTotals();
  for (const row of data) add(totals, row);
  const marks = data
    .flatMap((m) => (m.session ? [{ m, s: m.session }] : []))
    .map(({ m, s }) => ({
      date: s.session_date,
      start: shortTime(s.start_time),
      end: shortTime(s.end_time),
      classId: s.class_id,
      subjectName: s.subject?.name ?? "",
      subjectColor: (s.subject?.color ?? "slate") as SubjectColor,
      status: m.status as MarkStatus,
      minutesLate: m.minutes_late,
      note: m.note,
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.start.localeCompare(a.start));
  return { totals, marks };
}

export type ClassTotalsRow = StudentNames & { studentId: string; totals: AttendanceTotals };

/** Every student of a class (that year) with their totals between two dates; most absent first. */
export async function getClassTotals(
  schoolId: string,
  classId: string,
  yearId: string,
  from: string,
  to: string,
): Promise<ClassTotalsRow[]> {
  const supabase = await createClient();
  const [enrolled, marks] = await Promise.all([
    supabase
      .from("student_enrollments")
      .select("student:students(id, first_name, last_name, first_name_ar, last_name_ar)")
      .eq("school_id", schoolId)
      .eq("class_id", classId)
      .eq("academic_year_id", yearId),
    // A class's year is ~2000 marks by spring: paged, in the marks' key order (session, student).
    readAll(
      (rangeFrom, rangeTo) =>
        supabase
          .from("attendance_marks")
          .select(MARK_FIELDS)
          .eq("school_id", schoolId)
          .eq("session.class_id", classId)
          .gte("session.session_date", from)
          .lte("session.session_date", to)
          .order("session_id")
          .order("student_id")
          .range(rangeFrom, rangeTo)
          .overrideTypes<MarkRow[], { merge: false }>(),
      "getClassTotals",
    ),
  ]);
  if (enrolled.error) throw new Error("getClassTotals failed");

  const rows = new Map<string, ClassTotalsRow>();
  for (const e of enrolled.data) {
    const s = e.student;
    if (!s) continue;
    rows.set(s.id, {
      studentId: s.id,
      firstName: s.first_name,
      lastName: s.last_name,
      firstNameAr: s.first_name_ar,
      lastNameAr: s.last_name_ar,
      totals: emptyTotals(),
    });
  }
  for (const m of marks) {
    const row = rows.get(m.student_id);
    if (row) add(row.totals, m);
  }
  return [...rows.values()].sort(
    (a, b) =>
      b.totals.absentMinutes - a.totals.absentMinutes ||
      b.totals.lates - a.totals.lates ||
      a.lastName.localeCompare(b.lastName) ||
      a.firstName.localeCompare(b.firstName),
  );
}
