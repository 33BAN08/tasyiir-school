"use server";

import { logAudit } from "@/lib/audit";
import { getSchoolActor, type SchoolActor } from "@/lib/auth/school-actor";
import { isParentAccount } from "@/lib/parents/parent-accounts";
import { phoneLoginEmail } from "@/lib/parents/phone";
import { generateTemporaryPassword } from "@/lib/password";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { guardianIdSchema, parentActiveSchema } from "@/lib/validations/parents";
import { localeField } from "@/lib/validations/fields";

// Parent accounts (parents.manage). The guardian is read through RLS with the
// caller's session (own school only); the secret key is used only for the
// Auth account and its profile, like staff accounts (Phase 3). The temporary
// password is returned once and never stored or logged. Error keys: `parents.errors`.

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** Same ban as deactivated staff accounts: no new sign-in, no token refresh. */
const BAN_DURATION = "87600h";

async function guardianOf(actor: SchoolActor, guardianId: unknown) {
  const id = guardianIdSchema.safeParse(guardianId);
  if (!id.success) return null;
  const { data } = await (await createClient())
    .from("guardians")
    .select("id, last_name, first_name, phone, profile_id")
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .maybeSingle();
  return data;
}

function audit(actor: SchoolActor, action: string, guardianId: string) {
  // Never the password, never the phone.
  return logAudit({ actorId: actor.id, schoolId: actor.schoolId, action, entity: "guardian", entityId: guardianId });
}

/** Creates the parent's account: sign-in = their phone, temporary password, change at first sign-in. */
export async function createParentAccount(
  guardianId: unknown,
  locale: unknown,
): Promise<Result<{ phone: string; temporaryPassword: string }>> {
  const actor = await getSchoolActor("parents.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  if (actor.isDemo) return { ok: false, error: "demoLocked" };
  const guardian = await guardianOf(actor, guardianId);
  if (!guardian) return { ok: false, error: "notFound" };
  if (guardian.profile_id) return { ok: false, error: "accountExists" };
  const lang = localeField.safeParse(locale);

  const admin = createAdminClient();
  const { data: role } = await admin
    .from("roles")
    .select("id")
    .eq("school_id", actor.schoolId)
    .eq("key", "parent")
    .maybeSingle();
  if (!role) return { ok: false, error: "generic" };

  const temporaryPassword = generateTemporaryPassword();
  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email: phoneLoginEmail(guardian.phone),
    password: temporaryPassword,
    email_confirm: true,
  });
  if (userError) {
    // The phone already signs in to an account (here or in another school).
    if (userError.code === "email_exists") return { ok: false, error: "phoneHasAccount" };
    console.error("createParentAccount: createUser failed", userError.code);
    return { ok: false, error: "generic" };
  }
  const undo = () => admin.auth.admin.deleteUser(created.user.id);

  // No phone in the profile: it stays in guardians, out of the platform owner's reach.
  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    school_id: actor.schoolId,
    role_id: role.id,
    full_name: `${guardian.first_name} ${guardian.last_name}`,
    locale: lang.success ? lang.data : "ar",
    must_change_password: true,
  });
  if (profileError) {
    await undo();
    console.error("createParentAccount: profile insert failed", profileError.code);
    return { ok: false, error: "generic" };
  }

  // The link itself goes through RLS (parents.manage, own school).
  const { data: linked, error: linkError } = await (await createClient())
    .from("guardians")
    .update({ profile_id: created.user.id })
    .eq("id", guardian.id)
    .eq("school_id", actor.schoolId)
    .is("profile_id", null)
    .select("id");
  if (linkError || linked.length === 0) {
    await undo();
    return { ok: false, error: linkError ? "generic" : "accountExists" };
  }

  await audit(actor, "parent.account_create", guardian.id);
  return { ok: true, data: { phone: guardian.phone, temporaryPassword } };
}

type Guardian = NonNullable<Awaited<ReturnType<typeof guardianOf>>>;

async function parentAccountOf(
  actor: SchoolActor,
  guardianId: unknown,
): Promise<{ error: "notFound" | "noAccount" } | { guardian: Guardian; profileId: string }> {
  const guardian = await guardianOf(actor, guardianId);
  if (!guardian) return { error: "notFound" };
  if (!guardian.profile_id || !(await isParentAccount(actor.schoolId, guardian.profile_id))) {
    return { error: "noAccount" };
  }
  return { guardian, profileId: guardian.profile_id };
}

/** New temporary password, shown once; the parent must change it at next sign-in. */
export async function resetParentPassword(
  guardianId: unknown,
): Promise<Result<{ phone: string; temporaryPassword: string }>> {
  const actor = await getSchoolActor("parents.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  if (actor.isDemo) return { ok: false, error: "demoLocked" };
  const target = await parentAccountOf(actor, guardianId);
  if ("error" in target) return { ok: false, error: target.error };

  const admin = createAdminClient();
  const temporaryPassword = generateTemporaryPassword();
  const { error } = await admin.auth.admin.updateUserById(target.profileId, { password: temporaryPassword });
  if (error) {
    console.error("resetParentPassword: updateUserById failed", error.code);
    return { ok: false, error: "generic" };
  }
  const { error: flagError } = await admin
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", target.profileId)
    .eq("school_id", actor.schoolId);
  if (flagError) return { ok: false, error: "generic" };

  await audit(actor, "parent.password_reset", target.guardian.id);
  return { ok: true, data: { phone: target.guardian.phone, temporaryPassword } };
}

/**
 * Deactivate: profile flag first (RLS cuts access at once, even with a valid
 * session), then the Auth ban. Reactivate: the reverse. A failed second step
 * undoes the first.
 */
export async function setParentActive(guardianId: unknown, active: unknown): Promise<Result<null>> {
  const actor = await getSchoolActor("parents.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  if (actor.isDemo) return { ok: false, error: "demoLocked" };
  const wanted = parentActiveSchema.safeParse(active);
  if (!wanted.success) return { ok: false, error: "generic" };
  const target = await parentAccountOf(actor, guardianId);
  if ("error" in target) return { ok: false, error: target.error };

  const admin = createAdminClient();
  const setFlag = (deactivatedAt: string | null) =>
    admin.from("profiles").update({ deactivated_at: deactivatedAt }).eq("id", target.profileId).eq("school_id", actor.schoolId);
  const setBan = (banned: boolean) =>
    admin.auth.admin.updateUserById(target.profileId, { ban_duration: banned ? BAN_DURATION : "none" });

  if (!wanted.data) {
    if ((await setFlag(new Date().toISOString())).error) return { ok: false, error: "generic" };
    if ((await setBan(true)).error) {
      await setFlag(null);
      return { ok: false, error: "generic" };
    }
  } else {
    if ((await setBan(false)).error) return { ok: false, error: "generic" };
    if ((await setFlag(null)).error) {
      await setBan(true);
      return { ok: false, error: "generic" };
    }
  }

  await audit(actor, wanted.data ? "parent.reactivate" : "parent.deactivate", target.guardian.id);
  return { ok: true, data: null };
}
