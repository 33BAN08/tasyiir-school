import "server-only";

import { readAll } from "@/lib/supabase/read-all";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type ClassAveragesRow = Database["public"]["Functions"]["class_averages"]["Returns"][number];

// Averages and ranks of one class, ONLY from public.class_averages() (the same
// numbers as the report card and the tests): staff get every row, a teacher
// only the subjects they teach in that class (no general average).

export type AverageRow = {
  studentId: string;
  /** null = the year. */
  periodId: string | null;
  /** null = the general average. */
  subjectId: string | null;
  coefficient: number | null;
  marks: number | null;
  absences: number | null;
  /** General rows: subjects (semester) / semesters (year) without an average. */
  missing: number | null;
  average: number | null;
  rank: number | null;
  ranked: number;
  classAverage: number | null;
  classMin: number | null;
  classMax: number | null;
};

const num = (v: number | string | null) => (v === null ? null : Number(v));

/**
 * `periodId`: undefined = every row; a semester id = only that semester's rows;
 * null = only the year's rows. A big class has more rows than one API call
 * returns (40 students × 3 × 13 = 1560): read page by page (readAll), sorted
 * on (student, period, subject), unique per row.
 */
export async function getClassAverages(classId: string, periodId?: string | null): Promise<AverageRow[]> {
  const supabase = await createClient();
  const data = await readAll<ClassAveragesRow>((from, to) => {
    let query = supabase.rpc("class_averages", { p_class: classId });
    if (periodId === null) query = query.is("period_id", null);
    else if (periodId) query = query.eq("period_id", periodId);
    return query
      .order("student_id")
      .order("period_id", { nullsFirst: true })
      .order("subject_id", { nullsFirst: true })
      .range(from, to);
  }, "getClassAverages");
  // The generated types call every column non-null; NULL means "the year" / "general" / "no average".
  return data.map((r) => ({
    studentId: r.student_id,
    periodId: (r.period_id as string | null) ?? null,
    subjectId: (r.subject_id as string | null) ?? null,
    coefficient: num(r.coefficient as number | null),
    marks: (r.marks as number | null) ?? null,
    absences: (r.absences as number | null) ?? null,
    missing: (r.missing as number | null) ?? null,
    average: num(r.average as number | null),
    rank: (r.rank as number | null) ?? null,
    ranked: r.ranked ?? 0,
    classAverage: num(r.class_average as number | null),
    classMin: num(r.class_min as number | null),
    classMax: num(r.class_max as number | null),
  }));
}

/** Key of one row: student + semester ("year") + subject ("general"). */
export const averageKey = (studentId: string, periodId: string | null, subjectId: string | null) =>
  `${studentId}|${periodId ?? "year"}|${subjectId ?? "general"}`;

export function indexAverages(rows: AverageRow[]): Map<string, AverageRow> {
  return new Map(rows.map((r) => [averageKey(r.studentId, r.periodId, r.subjectId), r]));
}
