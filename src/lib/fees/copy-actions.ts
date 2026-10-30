"use server";

import { auditStructure, type StructureActionResult } from "@/lib/structure/action-utils";
import { createClient } from "@/lib/supabase/server";
import { feeIdSchema } from "@/lib/validations/fees";

import { feesErrorKey, getFeesActor } from "./actor";

// Plans + services of an earlier year into this one (fees.manage). Preview and
// copy run the SAME code (apply false / true), so what the preview lists is
// exactly what the copy does. Nothing already set in the target is
// overwritten: a level with a plan, a service with the same name.
// The billed months are not copied (each year's months are its own).

export type FeeCopyLine = {
  kind: "plan" | "service";
  /** Level id for a plan, service name for a service. */
  key: string;
  status: "copy" | "exists";
};

async function runFeeCopy(
  fromYearId: unknown,
  toYearId: unknown,
  apply: boolean,
): Promise<StructureActionResult<FeeCopyLine[]>> {
  const actor = await getFeesActor("fees.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const from = feeIdSchema.safeParse(fromYearId);
  const to = feeIdSchema.safeParse(toYearId);
  if (!from.success || !to.success) return { ok: false, error: "notFound" };

  const supabase = await createClient();
  const years = await supabase
    .from("academic_years")
    .select("id, start_date")
    .eq("school_id", actor.schoolId)
    .in("id", [from.data, to.data]);
  if (years.error) return { ok: false, error: feesErrorKey(years.error) };
  const start = new Map(years.data.map((y) => [y.id, y.start_date]));
  const fromStart = start.get(from.data);
  const toStart = start.get(to.data);
  if (!fromStart || !toStart) return { ok: false, error: "notFound" };
  if (fromStart >= toStart) return { ok: false, error: "sourceNotEarlier" };

  const plans = (year: string) =>
    supabase
      .from("fee_plans")
      .select("level_id, registration_centimes, monthly_centimes")
      .eq("school_id", actor.schoolId)
      .eq("academic_year_id", year);
  const services = (year: string) =>
    supabase
      .from("fee_services")
      .select("name, name_ar, monthly_centimes, active, position")
      .eq("school_id", actor.schoolId)
      .eq("academic_year_id", year);
  const [fromPlans, toPlans, fromServices, toServices] = await Promise.all([
    plans(from.data),
    plans(to.data),
    services(from.data),
    services(to.data),
  ]);
  if (fromPlans.error || toPlans.error || fromServices.error || toServices.error) {
    return { ok: false, error: feesErrorKey(fromPlans.error ?? toPlans.error ?? fromServices.error ?? toServices.error ?? {}) };
  }

  const levelsSet = new Set(toPlans.data.map((p) => p.level_id));
  const namesSet = new Set(toServices.data.map((s) => s.name.toLocaleLowerCase("fr")));
  const newPlans = fromPlans.data.filter((p) => !levelsSet.has(p.level_id));
  const newServices = fromServices.data.filter((s) => !namesSet.has(s.name.toLocaleLowerCase("fr")));
  const lines: FeeCopyLine[] = [
    ...fromPlans.data.map((p) => ({
      kind: "plan" as const,
      key: p.level_id,
      status: levelsSet.has(p.level_id) ? ("exists" as const) : ("copy" as const),
    })),
    ...fromServices.data.map((s) => ({
      kind: "service" as const,
      key: s.name,
      status: namesSet.has(s.name.toLocaleLowerCase("fr")) ? ("exists" as const) : ("copy" as const),
    })),
  ];
  if (!apply) return { ok: true, data: lines };

  if (newPlans.length > 0) {
    const { error } = await supabase
      .from("fee_plans")
      .insert(newPlans.map((p) => ({ ...p, school_id: actor.schoolId, academic_year_id: to.data })));
    if (error) return { ok: false, error: feesErrorKey(error) };
  }
  if (newServices.length > 0) {
    const { error } = await supabase
      .from("fee_services")
      .insert(newServices.map((s) => ({ ...s, school_id: actor.schoolId, academic_year_id: to.data })));
    if (error) return { ok: false, error: feesErrorKey(error) };
  }

  await auditStructure(actor, "fees.copy.year", "academic_year", to.data, {
    from: from.data,
    plans: newPlans.length,
    services: newServices.length,
  });
  return { ok: true, data: lines };
}

export async function previewFeeCopy(fromYearId: unknown, toYearId: unknown) {
  return runFeeCopy(fromYearId, toYearId, false);
}

export async function copyFeesFromYear(fromYearId: unknown, toYearId: unknown) {
  return runFeeCopy(fromYearId, toYearId, true);
}
