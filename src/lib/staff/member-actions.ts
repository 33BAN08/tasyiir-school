"use server";

import { logAudit } from "@/lib/audit";
import { generateTemporaryPassword } from "@/lib/password";
import type { StaffActionResult } from "@/lib/staff/actions";
import { getStaffManager, type StaffManager } from "@/lib/staff/guard";
import { roleAssignmentError, staffActionError, type StaffAction } from "@/lib/staff/rules";
import { countOtherActiveDirectors, loadStaffTarget, type LoadedStaffTarget } from "@/lib/staff/target";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  staffActiveSchema,
  staffDetailsSchema,
  staffIdSchema,
  staffRoleSchema,
  type StaffDetailsFormValues,
} from "@/lib/validations/staff";

// Actions on an existing staff account. Each one: caller check (getStaffManager)
// → target loaded from the caller's school only → shared rules → write with the
// secret key → audit log. Error keys are under `staff.errors`.

/** Ten years: Supabase Auth has no "forever"; the profile flag is the real switch. */
const BAN_DURATION = "87600h";

type Authorized = { actor: StaffManager; target: LoadedStaffTarget };

/** The database also keeps one active director per school (trigger); a concurrent change can still hit it. */
function writeError(error: { hint?: string | null; message?: string }) {
  if (error.hint === "last_active_director") return "lastDirector";
  if (error.message?.includes("plan_admin_limit")) return "planAdminLimit";
  // A teacher who leaves the teacher role loses their subjects, which their
  // timetable lessons still use (lessons_teacher_subject_fkey).
  if (error.message?.includes("lessons_teacher_subject_fkey")) return "teacherHasLessons";
  return "generic";
}

async function authorize(
  staffId: unknown,
  action: StaffAction,
  newRoleKey?: string,
): Promise<Authorized | { error: string }> {
  const actor = await getStaffManager();
  if (!actor) return { error: "forbidden" };
  if (actor.isDemo) return { error: "demoLocked" };
  const id = staffIdSchema.safeParse(staffId);
  if (!id.success) return { error: "notFound" };

  const target = await loadStaffTarget(actor.schoolId, id.data);
  if (!target) return { error: "notFound" };

  const otherActiveDirectors =
    target.roleKey === "director" ? await countOtherActiveDirectors(actor.schoolId, target.id) : 0;
  const denied = staffActionError(actor, target, action, { otherActiveDirectors, newRoleKey });
  return denied ? { error: denied } : { actor, target };
}

function audit({ actor, target }: Authorized, action: string, data: Record<string, string | null> = {}) {
  return logAudit({
    actorId: actor.id,
    schoolId: actor.schoolId,
    action,
    entity: "profile",
    entityId: target.id,
    data: { full_name: target.fullName, ...data },
  });
}

export async function updateStaffDetails(
  staffId: unknown,
  input: unknown,
): Promise<StaffActionResult<null, keyof StaffDetailsFormValues>> {
  const auth = await authorize(staffId, "edit");
  if ("error" in auth) return { ok: false, error: auth.error };

  const parsed = staffDetailsSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "generic",
      field: issue?.path[0] as keyof StaffDetailsFormValues | undefined,
    };
  }
  const v = parsed.data;

  const { error } = await createAdminClient()
    .from("profiles")
    .update({ full_name: v.fullName, phone: v.phone, locale: v.locale })
    .eq("id", auth.target.id)
    .eq("school_id", auth.actor.schoolId);
  if (error) return { ok: false, error: "generic" };

  await audit(auth, "staff.update", { new_full_name: v.fullName, phone: v.phone, locale: v.locale });
  return { ok: true, data: null };
}

export async function changeStaffRole(staffId: unknown, input: unknown): Promise<StaffActionResult<null, "roleId">> {
  const actor = await getStaffManager();
  if (!actor) return { ok: false, error: "forbidden" };
  if (actor.isDemo) return { ok: false, error: "demoLocked" };
  const parsed = staffRoleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "roleRequired", field: "roleId" };

  // The new role must be one the caller may assign, in the caller's school.
  const { data: role } = await createAdminClient()
    .from("roles")
    .select("id, key, role_permissions(permission_key)")
    .eq("id", parsed.data.roleId)
    .eq("school_id", actor.schoolId)
    .maybeSingle();
  if (!role) return { ok: false, error: "roleInvalid", field: "roleId" };
  const roleDenied = roleAssignmentError(actor, {
    key: role.key,
    permissions: role.role_permissions.map((p) => p.permission_key),
  });
  if (roleDenied) return { ok: false, error: roleDenied, field: "roleId" };

  const auth = await authorize(staffId, "changeRole", role.key);
  if ("error" in auth) return { ok: false, error: auth.error };
  if (auth.target.roleId === role.id) return { ok: true, data: null };

  const { error } = await createAdminClient()
    .from("profiles")
    .update({ role_id: role.id })
    .eq("id", auth.target.id)
    .eq("school_id", actor.schoolId);
  if (error) return { ok: false, error: writeError(error) };

  await audit(auth, "staff.role_change", { from_role: auth.target.roleKey, to_role: role.key });
  return { ok: true, data: null };
}

/** New temporary password, shown once to the caller; the user must change it at next sign-in. */
export async function resetStaffPassword(
  staffId: unknown,
): Promise<StaffActionResult<{ email: string | null; temporaryPassword: string }, never>> {
  const auth = await authorize(staffId, "resetPassword");
  if ("error" in auth) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  const temporaryPassword = generateTemporaryPassword();
  const { error: authError } = await admin.auth.admin.updateUserById(auth.target.id, {
    password: temporaryPassword,
  });
  if (authError) {
    console.error("resetStaffPassword: updateUserById failed", authError.code);
    return { ok: false, error: "generic" };
  }
  const { error } = await admin
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", auth.target.id)
    .eq("school_id", auth.actor.schoolId);
  if (error) return { ok: false, error: "generic" };

  await audit(auth, "staff.password_reset"); // Never the password.
  return { ok: true, data: { email: auth.target.email, temporaryPassword } };
}

/**
 * Deactivate: profile flag first (RLS cuts access immediately, even with a
 * valid session), then the Auth ban (no new sign-in / token refresh).
 * Reactivate: the reverse. If the second step fails, the first is undone.
 */
export async function setStaffActive(staffId: unknown, active: unknown): Promise<StaffActionResult<null, never>> {
  const wanted = staffActiveSchema.safeParse(active);
  if (!wanted.success) return { ok: false, error: "generic" };
  const auth = await authorize(staffId, wanted.data ? "reactivate" : "deactivate");
  if ("error" in auth) return { ok: false, error: auth.error };
  if (auth.target.deactivated === !wanted.data) return { ok: true, data: null };

  const admin = createAdminClient();
  const setFlag = (deactivatedAt: string | null) =>
    admin
      .from("profiles")
      .update({ deactivated_at: deactivatedAt })
      .eq("id", auth.target.id)
      .eq("school_id", auth.actor.schoolId);
  const setBan = (banned: boolean) =>
    admin.auth.admin.updateUserById(auth.target.id, { ban_duration: banned ? BAN_DURATION : "none" });

  if (!wanted.data) {
    const { error } = await setFlag(new Date().toISOString());
    if (error) return { ok: false, error: writeError(error) };
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

  await audit(auth, wanted.data ? "staff.reactivate" : "staff.deactivate");
  return { ok: true, data: null };
}
