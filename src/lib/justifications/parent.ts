import "server-only";

import type { MarkStatus } from "@/lib/attendance/types";
import type { SubjectColor } from "@/lib/structure/subject-template";
import { shortTime } from "@/lib/structure/time-slot-template";
import { createClient } from "@/lib/supabase/server";

import { absenceState, type CoverageJustification, type JustificationState } from "./coverage";

// A parent's reads, with their own session: RLS gives only their children's
// marks (and those sessions) and justifications.

export type ChildMark = {
  sessionId: string;
  date: string;
  start: string;
  end: string;
  subjectName: string;
  subjectColor: SubjectColor;
  status: MarkStatus;
  minutesLate: number | null;
  /** Of the justifications: justified (approved) > pending > rejected > none. */
  state: JustificationState;
};

export type ChildJustification = CoverageJustification & {
  id: string;
  reason: string;
  hasFile: boolean;
  reviewNote: string | null;
  submittedAt: string;
};

type MarkRow = {
  session_id: string;
  status: string;
  minutes_late: number | null;
  session: {
    session_date: string;
    start_time: string;
    end_time: string;
    subject: { name: string; color: string } | null;
  } | null;
};

type JustificationRow = {
  id: string;
  kind: string;
  status: string;
  from_date: string;
  to_date: string;
  session_id: string | null;
  reason: string;
  file_path: string | null;
  review_note: string | null;
  submitted_at: string;
};

/** A child's absences and late arrivals between two dates (inclusive), most recent first, and their justifications. */
export async function getChildAbsences(
  schoolId: string,
  studentId: string,
  from: string,
  to: string,
): Promise<{ marks: ChildMark[]; justifications: ChildJustification[] }> {
  const supabase = await createClient();
  const [marks, justifications] = await Promise.all([
    supabase
      .from("attendance_marks")
      .select(
        "session_id, status, minutes_late, session:attendance_sessions!inner(session_date, start_time, end_time, subject:subjects(name, color))",
      )
      .eq("school_id", schoolId)
      .eq("student_id", studentId)
      .gte("session.session_date", from)
      .lte("session.session_date", to)
      .overrideTypes<MarkRow[], { merge: false }>(),
    supabase
      .from("justifications")
      .select("id, kind, status, from_date, to_date, session_id, reason, file_path, review_note, submitted_at")
      .eq("school_id", schoolId)
      .eq("student_id", studentId)
      .order("submitted_at", { ascending: false })
      .overrideTypes<JustificationRow[], { merge: false }>(),
  ]);
  if (marks.error || justifications.error) throw new Error("getChildAbsences failed");

  const list: ChildJustification[] = justifications.data.map((j) => ({
    id: j.id,
    kind: j.kind as ChildJustification["kind"],
    status: j.status as ChildJustification["status"],
    fromDate: j.from_date,
    toDate: j.to_date,
    sessionId: j.session_id,
    reason: j.reason,
    hasFile: Boolean(j.file_path),
    reviewNote: j.review_note,
    submittedAt: j.submitted_at,
  }));

  const rows = marks.data
    .flatMap((m) => (m.session ? [{ m, s: m.session }] : []))
    .map(({ m, s }): ChildMark => {
      const date = s.session_date;
      return {
        sessionId: m.session_id,
        date,
        start: shortTime(s.start_time),
        end: shortTime(s.end_time),
        subjectName: s.subject?.name ?? "",
        subjectColor: (s.subject?.color ?? "slate") as SubjectColor,
        status: m.status as MarkStatus,
        minutesLate: m.minutes_late,
        state: absenceState({ sessionId: m.session_id, date }, list),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.start.localeCompare(a.start));
  return { marks: rows, justifications: list };
}
