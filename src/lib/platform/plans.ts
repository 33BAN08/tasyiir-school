import "server-only";

import { createClient } from "@/lib/supabase/server";

export type PlanOption = { id: string; key: string; name: string; priceMonthly: number; modules: string[] };

/**
 * Active plans with their modules, cheapest first (any signed-in user may read plans).
 * `alsoPlanId` (a validated uuid) adds a school's current plan even if it was deactivated.
 */
export async function listActivePlans(alsoPlanId?: string): Promise<PlanOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plans")
    .select("id, key, name, price_monthly, plan_modules(module_key, module:modules(sort_order))")
    .or(alsoPlanId ? `is_active.eq.true,id.eq.${alsoPlanId}` : "is_active.eq.true")
    .order("price_monthly")
    .order("name");
  if (error) throw new Error(`listActivePlans failed: ${error.code}`);

  return data.map((plan) => ({
    id: plan.id,
    key: plan.key,
    name: plan.name,
    priceMonthly: Number(plan.price_monthly),
    modules: [...plan.plan_modules]
      .sort((a, b) => (a.module?.sort_order ?? 0) - (b.module?.sort_order ?? 0))
      .map((pm) => pm.module_key),
  }));
}
