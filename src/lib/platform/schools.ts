import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  SCHOOLS_PAGE_SIZE,
  type SchoolListParams,
  type SchoolStatus,
  type SubscriptionStatus,
} from "@/lib/validations/platform";

// Platform-owner reads. They go through RLS (is_platform_owner() sees every
// school), so callers must have checked requireArea("platform") first.

export type SchoolListItem = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  status: SchoolStatus;
  createdAt: string;
  subscription: { status: SubscriptionStatus; planName: string } | null;
};

export type SchoolList = { items: SchoolListItem[]; total: number; page: number; pageCount: number };

const LIST_COLUMNS =
  "id, name, slug, city, status, created_at, subscriptions:school_subscriptions(status, created_at, plan:plans(name))";

/** PostgREST `or()` filter for a free-text search on name, slug and city. */
function searchFilter(q: string): string | null {
  // Drop characters that are syntax in or() / LIKE patterns.
  const term = q.replace(/[,()"\\%_*]/g, " ").trim();
  if (!term) return null;
  return ["name", "slug", "city"].map((col) => `${col}.ilike."%${term}%"`).join(",");
}

export async function listSchools(
  { q, status, page }: SchoolListParams,
  pageSize = SCHOOLS_PAGE_SIZE,
): Promise<SchoolList> {
  const supabase = await createClient();
  const filter = searchFilter(q);

  const run = (p: number) => {
    let query = supabase
      .from("schools")
      .select(LIST_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id")
      .range((p - 1) * pageSize, p * pageSize - 1);
    if (status) query = query.eq("status", status);
    if (filter) query = query.or(filter);
    return query;
  };

  let current = page;
  let result = await run(current);
  // Page past the end (PGRST103: range not satisfiable) → show the last page.
  if (result.error?.code === "PGRST103") {
    const { count } = await run(1);
    current = Math.max(1, Math.ceil((count ?? 0) / pageSize));
    result = await run(current);
  }
  if (result.error) throw new Error(`listSchools failed: ${result.error.code}`);

  const total = result.count ?? 0;
  return {
    items: (result.data ?? []).map(toListItem),
    total,
    page: current,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

type ListRow = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  status: string;
  created_at: string;
  subscriptions: { status: string; created_at: string; plan: { name: string } | null }[];
};

function toListItem(row: ListRow): SchoolListItem {
  // The current subscription is the non-expired one (unique index), else the latest.
  const subs = [...row.subscriptions].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const sub = subs.find((s) => s.status !== "expired") ?? subs[0];

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    city: row.city,
    status: row.status as SchoolStatus,
    createdAt: row.created_at,
    subscription: sub
      ? { status: sub.status as SubscriptionStatus, planName: sub.plan?.name ?? "—" }
      : null,
  };
}

export type PlatformStats = {
  totalSchools: number;
  activeSchools: number;
  suspendedSchools: number;
  trialSchools: number;
  /** Sum of monthly prices of active (paid) subscriptions of active schools. */
  mrr: number;
};

export async function getPlatformStats(): Promise<PlatformStats> {
  const supabase = await createClient();

  const [schools, subs] = await Promise.all([
    supabase.from("schools").select("status"),
    supabase
      .from("school_subscriptions")
      .select("status, plan:plans(price_monthly), school:schools!inner(status)")
      .in("status", ["trial", "active"])
      .eq("school.status", "active"),
  ]);
  if (schools.error || subs.error) throw new Error("getPlatformStats failed");

  const statuses = schools.data.map((s) => s.status);
  const paid = subs.data.filter((s) => s.status === "active");

  return {
    totalSchools: statuses.length,
    activeSchools: statuses.filter((s) => s === "active").length,
    suspendedSchools: statuses.filter((s) => s === "suspended").length,
    trialSchools: subs.data.length - paid.length,
    mrr: paid.reduce((sum, s) => sum + Number(s.plan?.price_monthly ?? 0), 0),
  };
}
