import "server-only";

import { cache } from "react";

import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Modules on for the signed-in user's school — same rule as the DB's
 * private.has_module(): a per-school override wins, otherwise the plan of a
 * trial / active subscription. RLS stays the real fence; this only decides what
 * to show (nav items, "not in your plan" pages).
 */
export const getModules = cache(async (): Promise<Set<string>> => {
  const user = await getCurrentUser();
  if (!user?.schoolId) return new Set();

  const supabase = await createClient();
  const [subs, overrides] = await Promise.all([
    supabase
      .from("school_subscriptions")
      .select("status, plan:plans(plan_modules(module_key))")
      .eq("school_id", user.schoolId)
      .in("status", ["trial", "active"]),
    supabase.from("school_modules").select("module_key, enabled").eq("school_id", user.schoolId),
  ]);

  const modules = new Set(
    (subs.data ?? []).flatMap((s) => (s.plan?.plan_modules ?? []).map((pm) => pm.module_key)),
  );
  for (const o of overrides.data ?? []) {
    if (o.enabled) modules.add(o.module_key);
    else modules.delete(o.module_key);
  }
  return modules;
});
