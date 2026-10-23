"use server";

import { logAudit } from "@/lib/audit";
import { generateTemporaryPassword } from "@/lib/password";
import { getStaffManager } from "@/lib/staff/guard";
import { roleAssignmentError } from "@/lib/staff/rules";
import { createAdminClient } from "@/lib/supabase/admin";
import { newStaffSchema, type NewStaffFormValues } from "@/lib/validations/staff";

/** `error` is a next-intl key under `staff.errors`; `field` points the form at it. */
export type StaffActionResult<T, F extends string = keyof NewStaffFormValues> =
  | { ok: true; data: T }
  | { ok: false; error: string; field?: F };

/**
 * Creates a staff account in the caller's school with a random temporary
 * password (shown once to the caller, changed at first sign-in).
 * The school always comes from the caller's session, never from the input.
 */
export async function createStaff(
  input: unknown,
): Promise<StaffActionResult<{ id: string; email: string; temporaryPassword: string }>> {
  const actor = await getStaffManager();
  if (!actor) return { ok: false, error: "forbidden" };

  const parsed = newStaffSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "generic",
      field: issue?.path[0] as keyof NewStaffFormValues | undefined,
    };
  }
  const v = parsed.data;
  const admin = createAdminClient();

  // The role must belong to the caller's school (another school's id is simply not found).
  const { data: role } = await admin
    .from("roles")
    .select("id, key, role_permissions(permission_key)")
    .eq("id", v.roleId)
    .eq("school_id", actor.schoolId)
    .maybeSingle();
  if (!role) return { ok: false, error: "roleInvalid", field: "roleId" };

  const denied = roleAssignmentError(actor, {
    key: role.key,
    permissions: role.role_permissions.map((p) => p.permission_key),
  });
  if (denied) return { ok: false, error: denied, field: "roleId" };

  const temporaryPassword = generateTemporaryPassword();
  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email: v.email,
    password: temporaryPassword,
    email_confirm: true,
  });
  if (userError) {
    if (userError.code === "email_exists") return { ok: false, error: "emailTaken", field: "email" };
    console.error("createStaff: createUser failed", userError.code);
    return { ok: false, error: "generic" };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    school_id: actor.schoolId,
    role_id: role.id,
    full_name: v.fullName,
    email: v.email,
    phone: v.phone,
    locale: v.locale,
    must_change_password: true,
  });
  if (profileError) {
    // No half-created account: remove the auth user again.
    await admin.auth.admin.deleteUser(created.user.id);
    if (profileError.message.includes("plan_admin_limit")) return { ok: false, error: "planAdminLimit" };
    console.error("createStaff: profile insert failed", profileError.code);
    return { ok: false, error: "generic" };
  }

  await logAudit({
    actorId: actor.id,
    schoolId: actor.schoolId,
    action: "staff.create",
    entity: "profile",
    entityId: created.user.id,
    // Never the password.
    data: { full_name: v.fullName, email: v.email, role_id: role.id, role_key: role.key },
  });

  return { ok: true, data: { id: created.user.id, email: v.email, temporaryPassword } };
}
