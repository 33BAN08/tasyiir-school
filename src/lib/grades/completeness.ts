import "server-only";

import { createClient } from "@/lib/supabase/server";

import { getClassAverages, type AverageRow } from "./averages";

// "Is a subject fully graded?" — display only, the calculation never changes:
// an empty cell is "not graded yet" and stays out of the average.
//   expected = the subject's contrôles (its own count, else the level's) + 1
//              for activités when the level has them (same rules as the
//              grades trigger and the sheet)
//   entered  = marks written: a score or "abs" (from class_averages(): marks
//              counted + absences, absences already inside marks when the
//              level counts an absence as 0). Marks of old columns beyond a
//              lowered count are entered marks too.
//   incomplete = entered < expected.

export type Completeness = {
  /** Expected marks per graded subject of the class. */
  expected: Map<string, number>;
  /** The level counts an absent contrôle as 0 (then "abs" is a mark that counts). */
  absentAsZero: boolean;
};

export async function getClassCompleteness(klass: { yearId: string; levelId: string; trackId: string | null }): Promise<Completeness> {
  const supabase = await createClient();
  const [rules, coefs] = await Promise.all([
    supabase.rpc("grade_level_rules", { p_year: klass.yearId }),
    supabase
      .from("subject_coefficients")
      .select("subject_id, track_id, controls_count")
      .eq("academic_year_id", klass.yearId)
      .eq("level_id", klass.levelId),
  ]);
  if (rules.error || coefs.error) throw new Error("getClassCompleteness failed");
  const level = rules.data.find((r) => r.level_id === klass.levelId);
  const controls = level?.controls_count ?? 4;
  const activities = level?.activities ? 1 : 0;
  // The filière's row wins over the level's common row, subject by subject.
  const rows = coefs.data
    .filter((c) => c.track_id === null || c.track_id === klass.trackId)
    .sort((a, b) => Number(a.track_id === null) - Number(b.track_id === null));
  const expected = new Map<string, number>();
  for (const c of rows) {
    if (!expected.has(c.subject_id)) expected.set(c.subject_id, (c.controls_count ?? controls) + activities);
  }
  return { expected, absentAsZero: level?.absent_as_zero ?? false };
}

/** Marks written for one subject row of class_averages(). */
export const enteredMarks = (row: Pick<AverageRow, "marks" | "absences">, absentAsZero: boolean) =>
  (row.marks ?? 0) + (absentAsZero ? 0 : (row.absences ?? 0));

export type Gap = { studentId: string; subjectId: string; periodId: string; entered: number; expected: number };

/** Every semester subject row with fewer marks than expected. */
export function findGaps(rows: AverageRow[], c: Completeness): Gap[] {
  const gaps: Gap[] = [];
  for (const r of rows) {
    if (!r.periodId || !r.subjectId) continue;
    const expected = c.expected.get(r.subjectId);
    if (expected === undefined) continue;
    const entered = enteredMarks(r, c.absentAsZero);
    if (entered < expected) gaps.push({ studentId: r.studentId, subjectId: r.subjectId, periodId: r.periodId, entered, expected });
  }
  return gaps;
}

/** A class's gaps for one semester (`periodId`) or every semester (null = the year). */
export async function getClassGaps(
  klass: { id: string; yearId: string; levelId: string; trackId: string | null },
  periodId: string | null,
): Promise<Gap[]> {
  const [completeness, rows] = await Promise.all([
    getClassCompleteness(klass),
    // The year's own rows hold no counts: read the semesters' rows.
    getClassAverages(klass.id, periodId ?? undefined),
  ]);
  return findGaps(rows, completeness);
}
