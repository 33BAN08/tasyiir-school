import "server-only";

import { fetchPage, pageRange } from "@/lib/pagination";
import { ilikeAny } from "@/lib/search";
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

export async function listSchools(
  { q, status, page }: SchoolListParams,
  pageSize = SCHOOLS_PAGE_SIZE,
): Promise<SchoolList> {
  const supabase = await createClient();
  const filter = ilikeAny(q, ["name", "slug", "city"]);

  const run = (p: number) => {
    let query = supabase
      .from("schools")
      .select(LIST_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id")
      .range(...pageRange(p, pageSize));
    if (status) query = query.eq("status", status);
    if (filter) query = query.or(filter);
    return query;
  };

  const { rows, ...paging } = await fetchPage(run, page, pageSize, "listSchools");
  return { items: rows.map(toListItem), ...paging };
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

// The demo school (is_demo) is a sales tool, not a customer: left out of every count and the MRR.
export async function getPlatformStats(): Promise<PlatformStats> {
  const supabase = await createClient();

  const [schools, subs] = await Promise.all([
    supabase.from("schools").select("status").eq("is_demo", false),
    supabase
      .from("school_subscriptions")
      .select("status, plan:plans(price_monthly), school:schools!inner(status, is_demo)")
      .in("status", ["trial", "active"])
      .eq("school.status", "active")
      .eq("school.is_demo", false),
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
