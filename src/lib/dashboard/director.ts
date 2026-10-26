import "server-only";

import type { SchoolClock } from "@/lib/attendance/clock";
import { compareClassNames } from "@/lib/structure/class-names";
import { readAll } from "@/lib/supabase/read-all";
import { createClient } from "@/lib/supabase/server";

import { dashboardRanges, startedAtLeast, type DateRange } from "./ranges";

// The school dashboard's data, with the caller's session (RLS decides; the two
// aggregates attendance_summary / grade_entry_progress return nothing to a
// caller without the permission). Each block is read only when the user may
// see it (permission + module), else it is null and its card is not shown.
// No read can pass the API's 1000 rows: aggregates, counts, or readAll().

/** A roll call counts as late this long after the lesson's start. */
export const ROLL_CALL_GRACE_MINUTES = 15;

type Totals = { absentStudents: number; absentMarks: number; lateMarks: number };
export type ClassCount = { classId: string; className: string; absentMarks: number };

export type DashboardData = {
  attendance: {
    today: Totals;
    week: Totals;
    lastWeek: Totals;
    /** Top classes by absences, last 30 days (most first, at most 5, none at 0). */
    topClasses: ClassCount[];
    /** Today's lessons started ≥ 15 min ago with no roll call yet, earliest first. */
    waiting: { lessonId: string; classId: string; className: string; subjectName: string; teacherName: string; start: string }[];
    lessonsToday: number;
    justificationsPending: number;
  } | null;
  grades: {
    periodId: string;
    periodNumber: number;
    periodCount: number;
    locked: boolean;
    /** Per class, least complete first. */
    progress: { classId: string; className: string; students: number; expected: number; entered: number }[];
    /** Classes whose semester is locked but not published. */
    toPublish: { classId: string; className: string }[];
    published: number;
  } | null;
  counts: { students: number | null; classes: number; teachers: number | null } | null;
};

type Access = { permissions: ReadonlySet<string>; modules: ReadonlySet<string> };

const sum = (rows: { absent_marks: number; late_marks: number; absent_students: number }[]): Totals => ({
  absentStudents: rows.reduce((n, r) => n + r.absent_students, 0),
  absentMarks: rows.reduce((n, r) => n + r.absent_marks, 0),
  lateMarks: rows.reduce((n, r) => n + r.late_marks, 0),
});

export async function getDashboard(schoolId: string, clock: SchoolClock, { permissions, modules }: Access): Promise<DashboardData> {
  const supabase = await createClient();
  const { data: year } = await supabase.from("academic_years").select("id").eq("school_id", schoolId).eq("is_current", true).maybeSingle();
  const classes = year
    ? ((await supabase.from("classes").select("id, name").eq("school_id", schoolId).eq("academic_year_id", year.id)).data ?? [])
    : [];
  const className = new Map(classes.map((c) => [c.id, c.name]));
  const can = (p: string) => permissions.has(p);

  // --- Attendance ---------------------------------------------------------------------------------------
  let attendance: DashboardData["attendance"] = null;
  if (modules.has("attendance") && (can("attendance.view") || can("attendance.manage"))) {
    const ranges = dashboardRanges(clock.date);
    const summary = async (r: DateRange) => {
      const { data, error } = await supabase.rpc("attendance_summary", { p_from: r.from, p_to: r.to });
      if (error) throw new Error("attendance_summary failed");
      return data;
    };
    const [today, week, lastWeek, last30, pending, waiting] = await Promise.all([
      summary(ranges.today), summary(ranges.week), summary(ranges.lastWeek), summary(ranges.last30),
      supabase.from("justifications").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "pending"),
      year ? waitingRollCalls(schoolId, year.id, clock) : Promise.resolve({ waiting: [], lessonsToday: 0 }),
    ]);
    attendance = {
      today: sum(today),
      week: sum(week),
      lastWeek: sum(lastWeek),
      topClasses: last30
        .filter((r) => r.absent_marks > 0)
        .map((r) => ({ classId: r.class_id, className: className.get(r.class_id) ?? "", absentMarks: r.absent_marks }))
        .sort((a, b) => b.absentMarks - a.absentMarks || compareClassNames(a.className, b.className))
        .slice(0, 5),
      waiting: waiting.waiting,
      lessonsToday: waiting.lessonsToday,
      justificationsPending: pending.count ?? 0,
    };
  }

  // --- Grades -------------------------------------------------------------------------------------------
  let grades: DashboardData["grades"] = null;
  if (year && modules.has("grades") && (can("grades.view") || can("grades.manage"))) {
    const { data: periods } = await supabase
      .from("grading_periods")
      .select("id, number, start_date, end_date, locked_at")
      .eq("academic_year_id", year.id)
      .order("number");
    const period = (periods ?? []).find((p) => p.start_date <= clock.date && clock.date <= p.end_date) ?? periods?.[0];
    if (period) {
      const [progress, publications] = await Promise.all([
        supabase.rpc("grade_entry_progress", { p_period: period.id }),
        supabase.from("grade_publications").select("class_id").eq("period_id", period.id),
      ]);
      if (progress.error) throw new Error("grade_entry_progress failed");
      const publishedIds = new Set((publications.data ?? []).map((p) => p.class_id));
      const ratio = (r: { expected: number; entered: number }) => (r.expected > 0 ? r.entered / r.expected : 1);
      grades = {
        periodId: period.id,
        periodNumber: period.number,
        periodCount: periods?.length ?? 2,
        locked: period.locked_at !== null,
        progress: progress.data
          .filter((r) => r.students > 0 && r.expected > 0)
          .map((r) => ({ classId: r.class_id, className: className.get(r.class_id) ?? "", students: r.students, expected: r.expected, entered: r.entered }))
          .sort((a, b) => ratio(a) - ratio(b) || compareClassNames(a.className, b.className)),
        toPublish: period.locked_at
          ? classes.filter((c) => !publishedIds.has(c.id)).map((c) => ({ classId: c.id, className: c.name })).sort((a, b) => compareClassNames(a.className, b.className))
          : [],
        published: publishedIds.size,
      };
    }
  }

  // --- Counts -------------------------------------------------------------------------------------------
  const canStudents = can("students.view") || can("students.manage");
  const canTeachers = can("users.view") || can("teachers.manage");
  const [students, teachers] = await Promise.all([
    canStudents && year
      ? supabase.from("student_enrollments").select("student_id", { count: "exact", head: true }).eq("school_id", schoolId).eq("academic_year_id", year.id)
      : null,
    canTeachers
      ? supabase.from("profiles").select("id, role:roles!inner(key)", { count: "exact", head: true })
          .eq("school_id", schoolId).eq("role.key", "teacher").is("deactivated_at", null)
      : null,
  ]);
  const counts = canStudents || canTeachers
    ? { students: students ? (students.count ?? 0) : null, classes: classes.length, teachers: teachers ? (teachers.count ?? 0) : null }
    : null;

  return { attendance, grades, counts };
}

/** Today's lessons (current year, today's weekday) started ≥ 15 min ago without a roll call. */
async function waitingRollCalls(schoolId: string, yearId: string, clock: SchoolClock) {
  if (clock.weekday < 1 || clock.weekday > 6) return { waiting: [], lessonsToday: 0 };
  const supabase = await createClient();
  const [lessons, sessions, teachers] = await Promise.all([
    readAll(
      (from, to) =>
        supabase
          .from("lessons")
          .select("id, class_id, teacher_id, subject:subjects(name), slot:time_slots!inner(day_of_week, start_time)")
          .eq("school_id", schoolId)
          .eq("academic_year_id", yearId)
          .eq("slot.day_of_week", clock.weekday)
          .order("id")
          .range(from, to),
      "waitingRollCalls",
    ),
    supabase.from("attendance_sessions").select("lesson_id").eq("school_id", schoolId).eq("session_date", clock.date),
    supabase.rpc("timetable_teachers", { p_year: yearId }),
  ]);
  const taken = new Set((sessions.data ?? []).map((s) => s.lesson_id));
  const teacherName = new Map((teachers.data ?? []).map((t) => [t.id, t.full_name]));
  const { data: classRows } = await supabase.from("classes").select("id, name").eq("academic_year_id", yearId);
  const className = new Map((classRows ?? []).map((c) => [c.id, c.name]));
  const waiting = lessons
    .filter((l) => l.slot && !taken.has(l.id) && startedAtLeast(l.slot.start_time.slice(0, 5), clock.time, ROLL_CALL_GRACE_MINUTES))
    .map((l) => ({
      lessonId: l.id,
      classId: l.class_id,
      className: className.get(l.class_id) ?? "",
      subjectName: l.subject?.name ?? "",
      teacherName: teacherName.get(l.teacher_id) ?? "",
      start: l.slot!.start_time.slice(0, 5),
    }))
    .sort((a, b) => a.start.localeCompare(b.start) || compareClassNames(a.className, b.className));
  return { waiting, lessonsToday: lessons.length };
}
