"use server";

import { logAudit } from "@/lib/audit";
import { endOfDayInCasablanca } from "@/lib/dates";
import { getPlatformOwner } from "@/lib/platform/guard";
import { provisionSchool, ProvisionError } from "@/lib/platform/provision";
import { createAdminClient } from "@/lib/supabase/admin";
import { newSchoolSchema, type NewSchoolFormValues } from "@/lib/validations/platform";

/** `error` is a next-intl key under `platform.errors`; `field` points the form at it. */
export type PlatformActionResult<T, F extends string = keyof NewSchoolFormValues> =
  | { ok: true; data: T }
  | { ok: false; error: string; field?: F };

/**
 * New-school wizard: the school, its director account and subscription in one go
 * (provisionSchool: all or nothing).
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

  let created: { schoolId: string; directorId: string };
  try {
    created = await provisionSchool(admin, {
      school: { name: v.name, slug: v.slug, city: v.city, phone: v.phone, address: v.address },
      director: { email: v.directorEmail, password: v.directorPassword, fullName: v.directorName, locale: v.directorLocale },
      subscription: {
        planId: plan.id,
        status: v.subscriptionStatus,
        startDate: v.startDate,
        endDate: v.endDate || null,
        trialEndsAt: v.subscriptionStatus === "trial" && v.trialEndsOn ? endOfDayInCasablanca(v.trialEndsOn) : null,
      },
    });
  } catch (error) {
    if (error instanceof ProvisionError) return { ok: false, error: error.key, field: error.field };
    console.error("createSchool failed", (error as { code?: string }).code ?? "unknown");
    return { ok: false, error: "generic" };
  }
  const { schoolId, directorId } = created;

  await logAudit({
    actorId: owner.id,
    schoolId,
    action: "school.create",
    entity: "school",
    entityId: schoolId,
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

  return { ok: true, data: { schoolId } };
}
