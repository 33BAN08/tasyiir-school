import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export type NewSchool = {
  school: { name: string; slug: string; city: string | null; phone: string | null; address: string | null };
  director: { email: string; password: string; fullName: string; locale: string };
  subscription: {
    planId: string;
    status: string;
    startDate: string;
    endDate: string | null;
    trialEndsAt: string | null;
    maxStudentsOverride?: number | null;
  };
};

/** A failure the platform owner can fix: `key` under `platform.errors`, `field` = the form field. */
export class ProvisionError extends Error {
  constructor(
    readonly key: "slugTaken" | "emailTaken" | "passwordWeak",
    readonly field: "slug" | "directorEmail" | "directorPassword",
  ) {
    super(key);
  }
}

/**
 * School (+ its roles, by trigger) → director account → profile → subscription,
 * all with the secret key (platform-owner actions only: the new-school wizard and
 * "Créer l'essai"). Supabase has no cross-service transaction, so if any step after
 * the school fails, what was already created is removed again: no half-created
 * school is ever left. Throws ProvisionError, or the unexpected error.
 */
export async function provisionSchool(admin: Admin, v: NewSchool): Promise<{ schoolId: string; directorId: string }> {
  const { data: school, error: schoolError } = await admin.from("schools").insert(v.school).select("id").single();
  if (schoolError) {
    if (schoolError.code === "23505") throw new ProvisionError("slugTaken", "slug");
    throw schoolError;
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
      email: v.director.email,
      password: v.director.password,
      email_confirm: true,
    });
    if (userError) {
      if (userError.code === "email_exists") throw new ProvisionError("emailTaken", "directorEmail");
      if (userError.code === "weak_password") throw new ProvisionError("passwordWeak", "directorPassword");
      throw userError;
    }
    directorId = created.user.id;

    const { error: profileError } = await admin.from("profiles").insert({
      id: directorId,
      school_id: school.id,
      role_id: role.id,
      full_name: v.director.fullName,
      locale: v.director.locale,
      must_change_password: true,
    });
    if (profileError) throw profileError;

    const { error: subscriptionError } = await admin.from("school_subscriptions").insert({
      school_id: school.id,
      plan_id: v.subscription.planId,
      status: v.subscription.status,
      start_date: v.subscription.startDate,
      end_date: v.subscription.endDate,
      trial_ends_at: v.subscription.trialEndsAt,
      max_students_override: v.subscription.maxStudentsOverride ?? null,
    });
    if (subscriptionError) throw subscriptionError;
  } catch (error) {
    // Roll back: auth user first (its profile goes with the school), then the school.
    if (directorId) await admin.auth.admin.deleteUser(directorId);
    await admin.from("schools").delete().eq("id", school.id);
    throw error;
  }

  return { schoolId: school.id, directorId };
}
