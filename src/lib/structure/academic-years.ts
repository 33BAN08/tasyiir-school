import "server-only";

import { todayInCasablanca } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { moroccanSchoolYear, type AcademicYearFormValues } from "@/lib/validations/structure";

// Reads for the academic years page, through RLS (own school only); the
// explicit school filter is a second fence.

export type YearStatus = "current" | "upcoming" | "past" | "inactive";

export type AcademicYear = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  status: YearStatus;
};

function statusOf(row: { is_current: boolean; start_date: string; end_date: string }, today: string): YearStatus {
  if (row.is_current) return "current";
  if (row.start_date > today) return "upcoming";
  if (row.end_date < today) return "past";
  return "inactive";
}

/** Most recent first. */
export async function listAcademicYears(schoolId: string): Promise<AcademicYear[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("academic_years")
    .select("id, label, start_date, end_date, is_current")
    .eq("school_id", schoolId)
    .order("start_date", { ascending: false });
  if (error) throw new Error("listAcademicYears failed");

  const today = todayInCasablanca();
  return data.map((row) => ({
    id: row.id,
    label: row.label,
    startDate: row.start_date,
    endDate: row.end_date,
    isCurrent: row.is_current,
    status: statusOf(row, today),
  }));
}

/**
 * What the "New year" form proposes: the year after the latest one, or else
 * the school year we are in (September → June; from July on, the next one).
 */
export function suggestAcademicYear(years: AcademicYear[]): AcademicYearFormValues {
  const latest = years[0];
  if (latest) return moroccanSchoolYear(Number(latest.startDate.slice(0, 4)) + 1);
  const [year, month] = todayInCasablanca().split("-").map(Number);
  return moroccanSchoolYear(month >= 7 ? year : year - 1);
}
