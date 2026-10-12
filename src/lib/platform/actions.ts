"use server";

import { logAudit } from "@/lib/audit";
import { endOfDayInCasablanca } from "@/lib/dates";
import { getPlatformOwner } from "@/lib/platform/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { newSchoolSchema, type NewSchoolFormValues } from "@/lib/validations/platform";

/** `error` is a next-intl key under `platform.wizard.errors`; `field` points the form at it. */
export type PlatformActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; field?: keyof NewSchoolFormValues };

/** A failure the platform owner can fix (vs. an unexpected one → "generic"). */
class KnownError extends Error {
  constructor(
    readonly key: string,
    readonly field?: keyof NewSchoolFormValues,
  ) {
    super(key);
  }
}

/**
 * New-school wizard: school (+ its roles, by trigger) → director account →
 * profile → subscription, all with the secret key. Supabase has no
 * cross-service transaction, so if any step after the school fails, what was
 * already created is removed again: no half-created school is ever left.
 */
export async function createSchool(input: unknown): Promise<PlatformActionResult<{ schoolId: string }>> {
  const owner = await getPlatformOwner();
  if (!owner) return { ok: false, error: "forbidden" };

  const parsed = newSchoolSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "generic",
      field: issue?.path[0] as keyof NewSchoolFormValues | undefined,
    };
  }
  const v = parsed.data;
  const admin = createAdminClient();

  const { data: plan } = await admin
    .from("plans")
    .select("id")
    .eq("id", v.planId)
    .eq("is_active", true)
    .maybeSingle();
  if (!plan) return { ok: false, error: "planRequired", field: "planId" };

  const { data: school, error: schoolError } = await admin
    .from("schools")
    .insert({ name: v.name, slug: v.slug, city: v.city, phone: v.phone, address: v.address })
    .select("id")
    .single();
  if (schoolError) {
    if (schoolError.code === "23505") return { ok: false, error: "slugTaken", field: "slug" };
    console.error("createSchool: school insert failed", schoolError.code);
    return { ok: false, error: "generic" };
  }

  let directorId: string | null = null;
  try {
    const { data: role, error: roleError } = await admin
      .from("roles")
      .select("id")
      .eq("school_id", school.id)
      .eq("key", "director")
      .single();
    if (roleError) throw roleError;

    const { data: created, error: userError } = await admin.auth.admin.createUser({
      email: v.directorEmail,
      password: v.directorPassword,
      email_confirm: true,
    });
    if (userError) {
      if (userError.code === "email_exists") throw new KnownError("emailTaken", "directorEmail");
      if (userError.code === "weak_password") throw new KnownError("passwordWeak", "directorPassword");
      throw userError;
    }
    directorId = created.user.id;

    const { error: profileError } = await admin.from("profiles").insert({
      id: directorId,
      school_id: school.id,
      role_id: role.id,
      full_name: v.directorName,
      locale: v.directorLocale,
      must_change_password: true,
    });
    if (profileError) throw profileError;

    const { error: subscriptionError } = await admin.from("school_subscriptions").insert({
      school_id: school.id,
      plan_id: plan.id,
      status: v.subscriptionStatus,
      start_date: v.startDate,
      end_date: v.endDate || null,
      trial_ends_at:
        v.subscriptionStatus === "trial" && v.trialEndsOn ? endOfDayInCasablanca(v.trialEndsOn) : null,
    });
    if (subscriptionError) throw subscriptionError;
  } catch (error) {
    // Roll back: auth user first (its profile goes with the school), then the school.
    if (directorId) await admin.auth.admin.deleteUser(directorId);
    await admin.from("schools").delete().eq("id", school.id);

    if (error instanceof KnownError) return { ok: false, error: error.key, field: error.field };
    console.error("createSchool failed", (error as { code?: string }).code ?? "unknown");
    return { ok: false, error: "generic" };
  }

  await logAudit({
    actorId: owner.id,
    schoolId: school.id,
    action: "school.create",
    entity: "school",
    entityId: school.id,
    // Never the password.
    data: {
      name: v.name,
      slug: v.slug,
      director_id: directorId,
      director_email: v.directorEmail,
      plan_id: plan.id,
      subscription_status: v.subscriptionStatus,
    },
  });

  return { ok: true, data: { schoolId: school.id } };
}
