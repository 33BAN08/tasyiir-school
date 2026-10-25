import "server-only";

import { createClient } from "@/lib/supabase/server";

// Reads for the grading setup page (/setup/grading), through RLS: every active
// account of the school while the grades module is on. The explicit school
// filter is a second fence.

export type GradingPeriod = {
  id: string;
  number: number;
  startDate: string;
  endDate: string;
  weight: number;
  locked: boolean;
};

/** The year's semesters, in order. */
export async function listGradingPeriods(schoolId: string, yearId: string): Promise<GradingPeriod[]> {
  const { data, error } = await (await createClient())
    .from("grading_periods")
    .select("id, number, start_date, end_date, weight, locked_at")
    .eq("school_id", schoolId)
    .eq("academic_year_id", yearId)
    .order("number");
  if (error) throw new Error("listGradingPeriods failed");
  return data.map((p) => ({
    id: p.id,
    number: p.number,
    startDate: p.start_date,
    endDate: p.end_date,
    weight: Number(p.weight),
    locked: p.locked_at !== null,
  }));
}

export type LevelRules = {
  levelId: string;
  scale: 10 | 20;
  controlsCount: number;
  activities: boolean;
  /** False = the defaults (no row for this level and year). */
  customised: boolean;
};

/** Effective rules per level for the year (defaults when the school changed nothing). */
export async function listLevelRules(yearId: string): Promise<Map<string, LevelRules>> {
  const { data, error } = await (await createClient()).rpc("grade_level_rules", { p_year: yearId });
  if (error) throw new Error("listLevelRules failed");
  return new Map(
    data.map((r) => [
      r.level_id,
      {
        levelId: r.level_id,
        scale: r.scale === 10 ? 10 : 20,
        controlsCount: r.controls_count,
        activities: r.activities,
        customised: r.customised,
      },
    ]),
  );
}

export type CoefficientRow = {
  id: string;
  levelId: string;
  trackId: string | null;
  subjectId: string;
  coefficient: number;
  controlsCount: number | null;
  position: number;
};

/** Every coefficient row of the given levels (one cycle) for the year: common + filières, report card order. */
export async function listCycleCoefficients(
  schoolId: string,
  yearId: string,
  levelIds: string[],
): Promise<CoefficientRow[]> {
  const { data, error } = await (await createClient())
    .from("subject_coefficients")
    .select("id, level_id, track_id, subject_id, coefficient, controls_count, position")
    .eq("school_id", schoolId)
    .eq("academic_year_id", yearId)
    .in("level_id", levelIds)
    .order("position");
  if (error) throw new Error("listCycleCoefficients failed");
  return data.map((c) => ({
    id: c.id,
    levelId: c.level_id,
    trackId: c.track_id,
    subjectId: c.subject_id,
    coefficient: Number(c.coefficient),
    controlsCount: c.controls_count,
    position: c.position,
  }));
}
