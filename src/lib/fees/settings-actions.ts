"use server";

import { auditStructure, parseInput, type StructureActionResult } from "@/lib/structure/action-utils";
import { createClient } from "@/lib/supabase/server";
import {
  feeIdSchema,
  feeMonthsSchema,
  feePlanRowsSchema,
  feeServiceSchema,
} from "@/lib/validations/fees";

import { feesErrorKey, getFeesActor } from "./actor";

// Fee settings of a year (fees.manage): billed months + due day, the plans
// grid, the services. Error keys: `fees.errors`. Every write goes through the
// caller's session (RLS: own school, fees module on, fees.manage).

type MonthsField = "months" | "dueDay";
type ServiceField = "name" | "nameAr" | "monthly";

export async function saveFeeMonths(yearId: unknown, input: unknown): Promise<StructureActionResult<null, MonthsField>> {
  const actor = await getFeesActor("fees.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const year = feeIdSchema.safeParse(yearId);
  if (!year.success) return { ok: false, error: "notFound" };
  const v = parseInput<typeof feeMonthsSchema, MonthsField>(feeMonthsSchema, input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const supabase = await createClient();
  const values = { billing_months: v.values.months, due_day: v.values.dueDay };
  // No upsert: the key columns have no UPDATE grant.
  const updated = await supabase
    .from("fee_years")
    .update(values)
    .eq("academic_year_id", year.data)
    .eq("school_id", actor.schoolId)
    .select("academic_year_id");
  if (updated.error) return { ok: false, error: feesErrorKey(updated.error) };
  if (updated.data.length === 0) {
    const inserted = await supabase
      .from("fee_years")
      .insert({ ...values, school_id: actor.schoolId, academic_year_id: year.data })
      .select("academic_year_id");
    if (inserted.error) return { ok: false, error: feesErrorKey(inserted.error) };
  }

  await auditStructure(actor, "fees.months.save", "academic_year", year.data, {
    months: v.values.months.length,
    due_day: v.values.dueDay,
  });
  return { ok: true, data: null };
}

/** Back to the defaults (September → June, the 5th): the year's row goes. */
export async function resetFeeMonths(yearId: unknown): Promise<StructureActionResult<null>> {
  const actor = await getFeesActor("fees.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const year = feeIdSchema.safeParse(yearId);
  if (!year.success) return { ok: false, error: "notFound" };

  const { error } = await (await createClient())
    .from("fee_years")
    .delete()
    .eq("academic_year_id", year.data)
    .eq("school_id", actor.schoolId);
  if (error) return { ok: false, error: feesErrorKey(error) };

  await auditStructure(actor, "fees.months.reset", "academic_year", year.data, {});
  return { ok: true, data: null };
}

/**
 * The plans grid: one row per changed level. Both amounts empty = no fee (the
 * level's row is removed); otherwise empty counts as 0. Deletes, then new rows
 * (one statement), then changed rows. `level` points at the first bad row.
 */
export async function saveFeePlans(
  yearId: unknown,
  rows: unknown,
): Promise<StructureActionResult<{ saved: number }> & { level?: string }> {
  const actor = await getFeesActor("fees.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const year = feeIdSchema.safeParse(yearId);
  if (!year.success) return { ok: false, error: "notFound" };
  const parsed = feePlanRowsSchema.safeParse(rows);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const index = typeof issue?.path[0] === "number" ? issue.path[0] : -1;
    const bad = Array.isArray(rows) ? (rows[index] as { levelId?: unknown } | undefined) : undefined;
    return {
      ok: false,
      error: issue?.message ?? "generic",
      level: typeof bad?.levelId === "string" ? bad.levelId : undefined,
    };
  }
  if (parsed.data.length === 0) return { ok: true, data: { saved: 0 } };

  const supabase = await createClient();
  const existing = await supabase
    .from("fee_plans")
    .select("id, level_id")
    .eq("school_id", actor.schoolId)
    .eq("academic_year_id", year.data);
  if (existing.error) return { ok: false, error: feesErrorKey(existing.error) };
  const idByLevel = new Map(existing.data.map((p) => [p.level_id, p.id]));

  const removed = parsed.data.filter((r) => r.registration === null && r.monthly === null);
  const kept = parsed.data.filter((r) => r.registration !== null || r.monthly !== null);
  const amounts = (r: (typeof kept)[number]) => ({
    registration_centimes: r.registration ?? 0,
    monthly_centimes: r.monthly ?? 0,
  });

  const removeIds = removed.flatMap((r) => idByLevel.get(r.levelId) ?? []);
  if (removeIds.length > 0) {
    const { error } = await supabase.from("fee_plans").delete().in("id", removeIds).eq("school_id", actor.schoolId);
    if (error) return { ok: false, error: feesErrorKey(error) };
  }
  const added = kept.filter((r) => !idByLevel.has(r.levelId));
  if (added.length > 0) {
    const { error } = await supabase.from("fee_plans").insert(
      added.map((r) => ({ school_id: actor.schoolId, academic_year_id: year.data, level_id: r.levelId, ...amounts(r) })),
    );
    if (error) return { ok: false, error: feesErrorKey(error) };
  }
  for (const r of kept.filter((r) => idByLevel.has(r.levelId))) {
    const { error } = await supabase
      .from("fee_plans")
      .update(amounts(r))
      .eq("id", idByLevel.get(r.levelId)!)
      .eq("school_id", actor.schoolId);
    if (error) return { ok: false, error: feesErrorKey(error), level: r.levelId };
  }

  await auditStructure(actor, "fees.plans.save", "academic_year", year.data, {
    added: added.length,
    changed: kept.length - added.length,
    removed: removeIds.length,
  });
  return { ok: true, data: { saved: parsed.data.length } };
}

export async function createFeeService(
  yearId: unknown,
  input: unknown,
): Promise<StructureActionResult<{ id: string }, ServiceField>> {
  const actor = await getFeesActor("fees.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const year = feeIdSchema.safeParse(yearId);
  if (!year.success) return { ok: false, error: "notFound" };
  const v = parseInput<typeof feeServiceSchema, ServiceField>(feeServiceSchema, input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const { data, error } = await (await createClient())
    .from("fee_services")
    .insert({
      school_id: actor.schoolId,
      academic_year_id: year.data,
      name: v.values.name,
      name_ar: v.values.nameAr,
      monthly_centimes: v.values.monthly!,
      active: v.values.active,
    })
    .select("id")
    .single();
  if (error) return serviceFailure(feesErrorKey(error));

  await auditStructure(actor, "fees.service.create", "fee_service", data.id, {
    name: v.values.name,
    monthly_centimes: v.values.monthly,
  });
  return { ok: true, data: { id: data.id } };
}

export async function updateFeeService(
  serviceId: unknown,
  input: unknown,
): Promise<StructureActionResult<null, ServiceField>> {
  const actor = await getFeesActor("fees.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = feeIdSchema.safeParse(serviceId);
  if (!id.success) return { ok: false, error: "notFound" };
  const v = parseInput<typeof feeServiceSchema, ServiceField>(feeServiceSchema, input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const { data, error } = await (await createClient())
    .from("fee_services")
    .update({ name: v.values.name, name_ar: v.values.nameAr, monthly_centimes: v.values.monthly!, active: v.values.active })
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .select("id");
  if (error) return serviceFailure(feesErrorKey(error));
  if (data.length === 0) return { ok: false, error: "notFound" };

  await auditStructure(actor, "fees.service.update", "fee_service", id.data, {
    name: v.values.name,
    monthly_centimes: v.values.monthly,
    active: v.values.active,
  });
  return { ok: true, data: null };
}

/** Only a service no student uses (otherwise: deactivate it). */
export async function deleteFeeService(serviceId: unknown): Promise<StructureActionResult<null>> {
  const actor = await getFeesActor("fees.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = feeIdSchema.safeParse(serviceId);
  if (!id.success) return { ok: false, error: "notFound" };

  const supabase = await createClient();
  const used = await supabase
    .from("student_services")
    .select("id", { count: "exact", head: true })
    .eq("school_id", actor.schoolId)
    .eq("service_id", id.data);
  if (used.error) return { ok: false, error: feesErrorKey(used.error) };
  if ((used.count ?? 0) > 0) return { ok: false, error: "serviceInUse" };

  const { data, error } = await supabase
    .from("fee_services")
    .delete()
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .select("name");
  if (error) return { ok: false, error: feesErrorKey(error) };
  if (data.length === 0) return { ok: false, error: "notFound" };

  await auditStructure(actor, "fees.service.delete", "fee_service", id.data, { name: data[0].name });
  return { ok: true, data: null };
}

function serviceFailure(error: string): StructureActionResult<never, ServiceField> {
  if (error === "serviceNameTaken" || error === "nameRequired") return { ok: false, error, field: "name" };
  if (error === "amountInvalid") return { ok: false, error, field: "monthly" };
  return { ok: false, error };
}
