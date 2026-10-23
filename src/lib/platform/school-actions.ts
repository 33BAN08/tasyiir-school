"use server";

import { refresh } from "next/cache";

import { logAudit } from "@/lib/audit";
import { endOfDayInCasablanca } from "@/lib/dates";
import type { PlatformActionResult } from "@/lib/platform/actions";
import { TRIAL } from "@/lib/demo-requests/trial";
import { getPlatformOwner } from "@/lib/platform/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  moduleOverrideSchema,
  schoolIdSchema,
  schoolInfoSchema,
  schoolStatusSchema,
  subscriptionSchema,
  type SchoolInfoFormValues,
  type SubscriptionFormValues,
} from "@/lib/validations/platform";

// School detail page actions. All writes use the secret key, so the platform-owner
// check below IS the access control. Every change is audited, then the page refreshes.

type Result<F extends string = string> = PlatformActionResult<null, F>;

function firstIssue<F extends string>(error: { issues: { message: string; path: PropertyKey[] }[] }) {
  const issue = error.issues[0];
  return { ok: false as const, error: issue?.message ?? "generic", field: issue?.path[0] as F | undefined };
}

export async function updateSchoolInfo(
  schoolId: unknown,
  input: unknown,
): Promise<Result<keyof SchoolInfoFormValues>> {
  const owner = await getPlatformOwner();
  if (!owner) return { ok: false, error: "forbidden" };
  const id = schoolIdSchema.safeParse(schoolId);
  if (!id.success) return { ok: false, error: "notFound" };
  const parsed = schoolInfoSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);

  const { data, error } = await createAdminClient()
    .from("schools")
    .update(parsed.data)
    .eq("id", id.data)
    .select("id");
  if (error) return { ok: false, error: "generic" };
  if (data.length === 0) return { ok: false, error: "notFound" };

  await logAudit({
    actorId: owner.id,
    schoolId: id.data,
    action: "school.update",
    entity: "school",
    entityId: id.data,
    data: parsed.data,
  });
  refresh();
  return { ok: true, data: null };
}

export async function updateSubscription(
  schoolId: unknown,
  input: unknown,
): Promise<Result<keyof SubscriptionFormValues>> {
  const owner = await getPlatformOwner();
  if (!owner) return { ok: false, error: "forbidden" };
  const id = schoolIdSchema.safeParse(schoolId);
  if (!id.success) return { ok: false, error: "notFound" };
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  const v = parsed.data;
  const admin = createAdminClient();

  const { data: subs, error: subsError } = await admin
    .from("school_subscriptions")
    .select("id, plan_id, status, max_students_override")
    .eq("school_id", id.data)
    .order("created_at", { ascending: false });
  if (subsError) return { ok: false, error: "generic" };
  const current = subs.find((s) => s.status !== "expired") ?? subs[0];

  // A deactivated plan can be kept by a school that already has it, never newly chosen.
  const { data: plan } = await admin.from("plans").select("id, is_active").eq("id", v.planId).maybeSingle();
  if (!plan || (!plan.is_active && plan.id !== current?.plan_id)) {
    return { ok: false, error: "planRequired", field: "planId" };
  }

  // A trial turned into a paid plan: the trial's 50-student cap goes, the plan's limit applies
  // (user, 2026-10-23). Any other number the platform owner typed is kept.
  const fromTrial = current && (current.status === "trial" || current.status === "expired");
  const maxStudentsOverride =
    fromTrial && v.subscriptionStatus === "active" && v.maxStudentsOverride === TRIAL.maxStudents
      ? null
      : v.maxStudentsOverride;

  const row = {
    plan_id: plan.id,
    status: v.subscriptionStatus,
    start_date: v.startDate,
    end_date: v.endDate || null,
    trial_ends_at:
      v.subscriptionStatus === "trial" && v.trialEndsOn ? endOfDayInCasablanca(v.trialEndsOn) : null,
    max_students_override: maxStudentsOverride,
    max_admins_override: v.maxAdminsOverride,
  };
  const { error } = current
    ? await admin.from("school_subscriptions").update(row).eq("id", current.id)
    : await admin.from("school_subscriptions").insert({ ...row, school_id: id.data });
  if (error) {
    console.error("updateSubscription failed", error.code);
    return { ok: false, error: "generic" };
  }

  await logAudit({
    actorId: owner.id,
    schoolId: id.data,
    action: "subscription.update",
    entity: "school_subscription",
    entityId: current?.id,
    data: {
      before: current ? { plan_id: current.plan_id, status: current.status } : null,
      after: { plan_id: row.plan_id, status: row.status, start_date: row.start_date, end_date: row.end_date },
    },
  });
  refresh();
  return { ok: true, data: null };
}

export async function setModuleOverride(schoolId: unknown, input: unknown): Promise<Result> {
  const owner = await getPlatformOwner();
  if (!owner) return { ok: false, error: "forbidden" };
  const id = schoolIdSchema.safeParse(schoolId);
  if (!id.success) return { ok: false, error: "notFound" };
  const parsed = moduleOverrideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "generic" };
  const { moduleKey, override } = parsed.data;
  const admin = createAdminClient();

  // "plan" = no override row: the module follows the subscription's plan again.
  const { error } =
    override === "plan"
      ? await admin.from("school_modules").delete().eq("school_id", id.data).eq("module_key", moduleKey)
      : await admin
          .from("school_modules")
          .upsert({ school_id: id.data, module_key: moduleKey, enabled: override === "on" });
  if (error) {
    console.error("setModuleOverride failed", error.code);
    return { ok: false, error: "generic" };
  }

  await logAudit({
    actorId: owner.id,
    schoolId: id.data,
    action: "module.override",
    entity: "module",
    entityId: moduleKey,
    data: { override },
  });
  refresh();
  return { ok: true, data: null };
}

/** Suspend = cut all access (RLS), keep every row. Reactivate restores it. Never deletes. */
export async function setSchoolStatus(schoolId: unknown, status: unknown): Promise<Result> {
  const owner = await getPlatformOwner();
  if (!owner) return { ok: false, error: "forbidden" };
  const id = schoolIdSchema.safeParse(schoolId);
  const next = schoolStatusSchema.safeParse(status);
  if (!id.success || !next.success) return { ok: false, error: "generic" };

  const { data, error } = await createAdminClient()
    .from("schools")
    .update({
      status: next.data,
      suspended_at: next.data === "suspended" ? new Date().toISOString() : null,
      // Set only by the trial expiry job ('trial_ended'); a hand suspension or a reactivation clears it.
      suspension_reason: null,
    })
    .eq("id", id.data)
    .neq("status", next.data) // already in that state: nothing to do, nothing to log
    .select("id");
  if (error) {
    console.error("setSchoolStatus failed", error.code);
    return { ok: false, error: "generic" };
  }

  if (data.length > 0) {
    await logAudit({
      actorId: owner.id,
      schoolId: id.data,
      action: next.data === "suspended" ? "school.suspend" : "school.activate",
      entity: "school",
      entityId: id.data,
    });
  }
  refresh();
  return { ok: true, data: null };
}
