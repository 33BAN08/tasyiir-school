import "server-only";

import { dateInCasablanca } from "@/lib/dates";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { SchoolStatus, SubscriptionStatus } from "@/lib/validations/platform";
import type { Json } from "@/types/database";

// Platform-owner reads for /platform/schools/[id]. Callers must have checked
// requireArea("platform") first (RLS: is_platform_owner() sees every school).

export type SchoolSubscription = {
  id: string;
  planId: string;
  planName: string;
  status: SubscriptionStatus;
  startDate: string;
  endDate: string | null;
  /** Last day of the trial in Casablanca, `yyyy-MM-dd`. */
  trialEndsOn: string | null;
};

export type SchoolDirector = {
  id: string;
  fullName: string;
  email: string | null;
  mustChangePassword: boolean;
};

export type AuditEntry = { id: number; action: string; createdAt: string; actorName: string | null; data: Json };

export type SchoolDetail = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  phone: string | null;
  address: string | null;
  status: SchoolStatus;
  suspendedAt: string | null;
  createdAt: string;
  subscription: SchoolSubscription | null;
  /** Modules of the current plan (none without an active or trial subscription). */
  planModules: string[];
  /** All module keys, in display order. */
  modules: string[];
  /** Per-school overrides: module key → forced on/off. */
  overrides: Record<string, boolean>;
  directors: SchoolDirector[];
  audit: AuditEntry[];
};

const AUDIT_LIMIT = 10;

export async function getSchoolDetail(id: string): Promise<SchoolDetail | null> {
  const supabase = await createClient();

  const { data: school, error } = await supabase
    .from("schools")
    .select("id, name, slug, city, phone, address, status, suspended_at, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getSchoolDetail failed: ${error.code}`);
  if (!school) return null;

  const [subs, modules, overrides, directors, audit] = await Promise.all([
    supabase
      .from("school_subscriptions")
      .select("id, plan_id, status, start_date, end_date, trial_ends_at, plan:plans(name, plan_modules(module_key))")
      .eq("school_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("modules").select("key").order("sort_order"),
    supabase.from("school_modules").select("module_key, enabled").eq("school_id", id),
    supabase
      .from("profiles")
      .select("id, full_name, must_change_password, role:roles!inner(key)")
      .eq("school_id", id)
      .eq("role.key", "director")
      .order("created_at"),
    supabase
      .from("audit_logs")
      .select("id, action, created_at, actor_id, data")
      .eq("school_id", id)
      .order("created_at", { ascending: false })
      .limit(AUDIT_LIMIT),
  ]);
  for (const result of [subs, modules, overrides, directors, audit]) {
    if (result.error) throw new Error(`getSchoolDetail failed: ${result.error.code}`);
  }

  // Current = the non-expired one (unique index), else the latest.
  const sub = subs.data!.find((s) => s.status !== "expired") ?? subs.data![0];
  const subscription: SchoolSubscription | null = sub
    ? {
        id: sub.id,
        planId: sub.plan_id,
        planName: sub.plan?.name ?? "—",
        status: sub.status as SubscriptionStatus,
        startDate: sub.start_date,
        endDate: sub.end_date,
        trialEndsOn: sub.trial_ends_at ? dateInCasablanca(sub.trial_ends_at) : null,
      }
    : null;
  // Same rule as private.has_module(): only a trial/active subscription grants plan modules.
  const planModules =
    sub && (sub.status === "trial" || sub.status === "active")
      ? (sub.plan?.plan_modules ?? []).map((pm) => pm.module_key)
      : [];

  return {
    id: school.id,
    name: school.name,
    slug: school.slug,
    city: school.city,
    phone: school.phone,
    address: school.address,
    status: school.status as SchoolStatus,
    suspendedAt: school.suspended_at,
    createdAt: school.created_at,
    subscription,
    planModules,
    modules: modules.data!.map((m) => m.key),
    overrides: Object.fromEntries(overrides.data!.map((o) => [o.module_key, o.enabled])),
    directors: await withEmails(directors.data!),
    audit: await withActorNames(audit.data!),
  };
}

/** E-mails live in auth.users, which only the secret key can read. */
async function withEmails(
  rows: { id: string; full_name: string; must_change_password: boolean }[],
): Promise<SchoolDirector[]> {
  const admin = createAdminClient();
  return Promise.all(
    rows.map(async (row) => {
      const { data } = await admin.auth.admin.getUserById(row.id);
      return {
        id: row.id,
        fullName: row.full_name,
        email: data.user?.email ?? null,
        mustChangePassword: row.must_change_password,
      };
    }),
  );
}

async function withActorNames(
  rows: { id: number; action: string; created_at: string; actor_id: string | null; data: Json }[],
): Promise<AuditEntry[]> {
  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter((v): v is string => !!v))];
  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    const supabase = await createClient();
    const { data } = await supabase.from("profiles").select("id, full_name").in("id", actorIds);
    data?.forEach((p) => names.set(p.id, p.full_name));
  }
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    createdAt: r.created_at,
    actorName: r.actor_id ? (names.get(r.actor_id) ?? null) : null,
    data: r.data,
  }));
}
