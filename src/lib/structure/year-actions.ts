"use server";

import type { z } from "zod";

import { logAudit } from "@/lib/audit";
import { getSchoolActor, type SchoolActor } from "@/lib/auth/school-actor";
import { dbErrorKey } from "@/lib/structure/db-errors";
import { createClient } from "@/lib/supabase/server";
import { academicYearSchema, structureIdSchema, type AcademicYearFormValues } from "@/lib/validations/structure";

// Academic years (structure.manage). Writes go through RLS with the caller's
// own session (CLAUDE.md: school data is never written with the secret key):
// caller check → validation → write → audit log. Error keys: `setup.errors`.

export type StructureActionResult<T, F extends string = never> =
  | { ok: true; data: T }
  | { ok: false; error: string; field?: F };

type YearField = keyof AcademicYearFormValues;

const YEAR_CONSTRAINTS = {
  academic_years_label_key: "labelTaken",
  academic_years_no_overlap: "yearOverlap",
  academic_years_dates_check: "yearTooLong",
};

const FIELD_OF: Record<string, YearField> = { labelTaken: "label", yearOverlap: "startDate", yearTooLong: "endDate" };

function failure(key: string): { ok: false; error: string; field?: YearField } {
  return { ok: false, error: key, field: FIELD_OF[key] };
}

function audit(actor: SchoolActor, action: string, yearId: string, data: Record<string, string | boolean>) {
  return logAudit({ actorId: actor.id, schoolId: actor.schoolId, action, entity: "academic_year", entityId: yearId, data });
}

function parse(
  input: unknown,
): { values: z.output<typeof academicYearSchema> } | { error: string; field?: YearField } {
  const parsed = academicYearSchema.safeParse(input);
  if (parsed.success) return { values: parsed.data };
  const issue = parsed.error.issues[0];
  return { error: issue?.message ?? "generic", field: issue?.path[0] as YearField | undefined };
}

/** New year. The school's first year becomes the current one. */
export async function createAcademicYear(input: unknown): Promise<StructureActionResult<{ id: string }, YearField>> {
  const actor = await getSchoolActor("structure.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const v = parse(input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const supabase = await createClient();
  const { count } = await supabase
    .from("academic_years")
    .select("id", { count: "exact", head: true })
    .eq("school_id", actor.schoolId)
    .eq("is_current", true);

  const { data, error } = await supabase
    .from("academic_years")
    .insert({
      school_id: actor.schoolId,
      label: v.values.label,
      start_date: v.values.startDate,
      end_date: v.values.endDate,
      is_current: count === 0,
    })
    .select("id")
    .single();
  if (error) return failure(dbErrorKey(error, YEAR_CONSTRAINTS));

  await audit(actor, "academic_year.create", data.id, { label: v.values.label, is_current: count === 0 });
  return { ok: true, data: { id: data.id } };
}

export async function updateAcademicYear(yearId: unknown, input: unknown): Promise<StructureActionResult<null, YearField>> {
  const actor = await getSchoolActor("structure.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = structureIdSchema.safeParse(yearId);
  if (!id.success) return { ok: false, error: "notFound" };
  const v = parse(input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const { data, error } = await (await createClient())
    .from("academic_years")
    .update({ label: v.values.label, start_date: v.values.startDate, end_date: v.values.endDate })
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .select("id");
  if (error) return failure(dbErrorKey(error, YEAR_CONSTRAINTS));
  if (data.length === 0) return { ok: false, error: "notFound" };

  await audit(actor, "academic_year.update", id.data, {
    label: v.values.label,
    start_date: v.values.startDate,
    end_date: v.values.endDate,
  });
  return { ok: true, data: null };
}

/** One atomic UPDATE: the database un-sets the previous current year (trigger). */
export async function setCurrentAcademicYear(yearId: unknown): Promise<StructureActionResult<null>> {
  const actor = await getSchoolActor("structure.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = structureIdSchema.safeParse(yearId);
  if (!id.success) return { ok: false, error: "notFound" };

  const { data, error } = await (await createClient())
    .from("academic_years")
    .update({ is_current: true })
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .select("label");
  if (error) return { ok: false, error: dbErrorKey(error) };
  if (data.length === 0) return { ok: false, error: "notFound" };

  await audit(actor, "academic_year.set_current", id.data, { label: data[0].label });
  return { ok: true, data: null };
}

/** The current year cannot be deleted (make another one current first). */
export async function deleteAcademicYear(yearId: unknown): Promise<StructureActionResult<null>> {
  const actor = await getSchoolActor("structure.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = structureIdSchema.safeParse(yearId);
  if (!id.success) return { ok: false, error: "notFound" };

  const supabase = await createClient();
  const { data: year } = await supabase
    .from("academic_years")
    .select("label, is_current")
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .maybeSingle();
  if (!year) return { ok: false, error: "notFound" };
  if (year.is_current) return { ok: false, error: "deleteCurrent" };

  const { data, error } = await supabase
    .from("academic_years")
    .delete()
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .eq("is_current", false)
    .select("id");
  if (error) return { ok: false, error: dbErrorKey(error) };
  if (data.length === 0) return { ok: false, error: "notFound" };

  await audit(actor, "academic_year.delete", id.data, { label: year.label });
  return { ok: true, data: null };
}
