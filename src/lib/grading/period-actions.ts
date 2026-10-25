"use server";

import { getSchoolActor } from "@/lib/auth/school-actor";
import { auditStructure, parseInput, type StructureActionResult } from "@/lib/structure/action-utils";
import { dbErrorKey } from "@/lib/structure/db-errors";
import { createClient } from "@/lib/supabase/server";
import { gradingIdSchema, periodSchema, type PeriodFormValues } from "@/lib/validations/grading";

// Semesters (grades.manage), written through RLS with the caller's session.
// The database keeps them inside the year, apart, and frozen while locked.
// Error keys: `grading.errors`.

type PeriodField = keyof PeriodFormValues;

const PERIOD_ERRORS = {
  grading_period_locked: "periodLocked",
  grading_period_outside_year: "periodOutsideYear",
  grading_periods_no_overlap: "periodOverlap",
  grading_periods_dates_check: "endBeforeStart",
  grading_periods_weight_check: "weightRange",
};
const FIELD_OF: Record<string, PeriodField> = {
  periodOutsideYear: "startDate",
  periodOverlap: "startDate",
  endBeforeStart: "endDate",
  weightRange: "weight",
};

export async function updatePeriod(
  periodId: unknown,
  input: unknown,
): Promise<StructureActionResult<null, PeriodField>> {
  const actor = await getSchoolActor("grades.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = gradingIdSchema.safeParse(periodId);
  if (!id.success) return { ok: false, error: "notFound" };
  const v = parseInput<typeof periodSchema, PeriodField>(periodSchema, input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const { data, error } = await (await createClient())
    .from("grading_periods")
    .update({ start_date: v.values.startDate, end_date: v.values.endDate, weight: v.values.weight })
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .select("number");
  if (error) {
    const key = dbErrorKey(error, PERIOD_ERRORS);
    return { ok: false, error: key, field: FIELD_OF[key] };
  }
  if (data.length === 0) return { ok: false, error: "notFound" };

  await auditStructure(actor, "grading.period.update", "grading_period", id.data, {
    number: data[0].number,
    start: v.values.startDate,
    end: v.values.endDate,
    weight: v.values.weight,
  });
  return { ok: true, data: null };
}

/** Lock (the time and who come from the database) or unlock a semester. */
export async function setPeriodLocked(periodId: unknown, locked: unknown): Promise<StructureActionResult<null>> {
  const actor = await getSchoolActor("grades.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = gradingIdSchema.safeParse(periodId);
  if (!id.success || typeof locked !== "boolean") return { ok: false, error: "notFound" };

  const { data, error } = await (await createClient())
    .from("grading_periods")
    .update({ locked_at: locked ? new Date().toISOString() : null })
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .select("number");
  if (error) return { ok: false, error: dbErrorKey(error, PERIOD_ERRORS) };
  if (data.length === 0) return { ok: false, error: "notFound" };

  await auditStructure(actor, locked ? "grading.period.lock" : "grading.period.unlock", "grading_period", id.data, {
    number: data[0].number,
  });
  return { ok: true, data: null };
}
