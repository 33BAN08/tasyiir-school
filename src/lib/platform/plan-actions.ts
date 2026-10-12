"use server";

import { refresh } from "next/cache";

import { logAudit } from "@/lib/audit";
import type { PlatformActionResult } from "@/lib/platform/actions";
import { getPlatformOwner } from "@/lib/platform/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { planIdSchema, planSchema, type PlanFormValues } from "@/lib/validations/platform";

/**
 * Edit a plan: name, prices, student limit, active flag and its modules.
 * Deactivating never touches schools already on the plan; it only hides the
 * plan from the new-school wizard and from plan changes.
 */
export async function updatePlan(
  planId: unknown,
  input: unknown,
): Promise<PlatformActionResult<null, keyof PlanFormValues>> {
  const owner = await getPlatformOwner();
  if (!owner) return { ok: false, error: "forbidden" };
  const id = planIdSchema.safeParse(planId);
  if (!id.success) return { ok: false, error: "generic" };
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "generic",
      field: issue?.path[0] as keyof PlanFormValues | undefined,
    };
  }
  const v = parsed.data;
  const admin = createAdminClient();

  const { data: current, error: currentError } = await admin
    .from("plan_modules")
    .select("module_key")
    .eq("plan_id", id.data);
  if (currentError) return { ok: false, error: "generic" };
  const before = current.map((m) => m.module_key);
  const added = v.modules.filter((m) => !before.includes(m));
  const removed = before.filter((m) => !v.modules.includes(m));

  // Add first, then remove: if the second call fails the plan has extra modules
  // for a moment, never none.
  if (added.length > 0) {
    const { error } = await admin
      .from("plan_modules")
      .insert(added.map((module_key) => ({ plan_id: id.data, module_key })));
    if (error) {
      console.error("updatePlan: add modules failed", error.code);
      return { ok: false, error: "generic" };
    }
  }
  if (removed.length > 0) {
    const { error } = await admin
      .from("plan_modules")
      .delete()
      .eq("plan_id", id.data)
      .in("module_key", removed);
    if (error) {
      console.error("updatePlan: remove modules failed", error.code);
      return { ok: false, error: "generic" };
    }
  }

  const { data, error } = await admin
    .from("plans")
    .update({
      name: v.name,
      price_monthly: v.priceMonthly,
      price_yearly: v.priceYearly,
      max_students: v.maxStudents,
      is_active: v.isActive,
    })
    .eq("id", id.data)
    .select("id");
  if (error) {
    console.error("updatePlan failed", error.code);
    return { ok: false, error: "generic" };
  }
  if (data.length === 0) return { ok: false, error: "generic" };

  await logAudit({
    actorId: owner.id,
    schoolId: null, // platform-level change
    action: "plan.update",
    entity: "plan",
    entityId: id.data,
    data: {
      name: v.name,
      price_monthly: v.priceMonthly,
      price_yearly: v.priceYearly,
      max_students: v.maxStudents,
      is_active: v.isActive,
      modules_added: added,
      modules_removed: removed,
    },
  });
  refresh();
  return { ok: true, data: null };
}
