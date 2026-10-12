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
    .order("price_monthly");
  if (error) throw new Error(`listActivePlans failed: ${error.code}`);

  return byTier(data.map((plan) => ({
    id: plan.id,
    key: plan.key,
    name: plan.name,
    priceMonthly: Number(plan.price_monthly),
    modules: [...plan.plan_modules]
      .sort((a, b) => (a.module?.sort_order ?? 0) - (b.module?.sort_order ?? 0))
      .map((pm) => pm.module_key),
  })));
}

/**
 * Cheapest first; equal prices (e.g. all 0 before real prices are set) fall
 * back to the number of modules, so Basic → Pro → Premium stays in tier order.
 */
function byTier<T extends PlanOption>(plans: T[]): T[] {
  return [...plans].sort(
    (a, b) => a.priceMonthly - b.priceMonthly || a.modules.length - b.modules.length || a.name.localeCompare(b.name),
  );
}

export type PlanAdmin = PlanOption & {
  priceYearly: number;
  maxStudents: number | null;
  isActive: boolean;
  /** Schools whose current (non-expired) subscription is on this plan. */
  schoolCount: number;
};

/** Every plan, active or not, for the platform owner's plans page. */
export async function listPlansForAdmin(): Promise<PlanAdmin[]> {
  const supabase = await createClient();
  const [plans, subs] = await Promise.all([
    supabase
      .from("plans")
      .select(
        "id, key, name, price_monthly, price_yearly, max_students, is_active, plan_modules(module_key, module:modules(sort_order))",
      )
      .order("price_monthly"),
    supabase.from("school_subscriptions").select("plan_id").neq("status", "expired"),
  ]);
  if (plans.error || subs.error) throw new Error("listPlansForAdmin failed");

  const counts = new Map<string, number>();
  subs.data.forEach((s) => counts.set(s.plan_id, (counts.get(s.plan_id) ?? 0) + 1));

  return byTier(plans.data.map((plan) => ({
    id: plan.id,
    key: plan.key,
    name: plan.name,
    priceMonthly: Number(plan.price_monthly),
    priceYearly: Number(plan.price_yearly),
    maxStudents: plan.max_students,
    isActive: plan.is_active,
    schoolCount: counts.get(plan.id) ?? 0,
    modules: [...plan.plan_modules]
      .sort((a, b) => (a.module?.sort_order ?? 0) - (b.module?.sort_order ?? 0))
      .map((pm) => pm.module_key),
  })));
}

/** All module keys in display order. */
export async function listModuleKeys(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("modules").select("key").order("sort_order");
  if (error) throw new Error(`listModuleKeys failed: ${error.code}`);
  return data.map((m) => m.key);
}
