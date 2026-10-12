"use server";

import { logAudit } from "@/lib/audit";
import { getSchoolActor, type SchoolActor } from "@/lib/auth/school-actor";
import { customRoleKey, roleEditError, type ManagedRole, type RoleEdit } from "@/lib/roles/rules";
import { createAdminClient } from "@/lib/supabase/admin";
import { roleIdSchema, roleNameSchema, rolePermissionsSchema } from "@/lib/validations/roles";

// Role management (roles.manage). Each action: caller check → role loaded from
// the caller's school only → shared rules (rules.ts) → write with the secret
// key → audit log. Error keys are under `staffRoles.errors`.

export type RoleActionResult<T> = { ok: true; data: T } | { ok: false; error: string; field?: "name" };

type LoadedRole = ManagedRole & { name: string; permissions: string[] };

async function loadRole(schoolId: string, roleId: unknown): Promise<LoadedRole | null> {
  const id = roleIdSchema.safeParse(roleId);
  if (!id.success) return null;
  const { data } = await createAdminClient()
    .from("roles")
    .select("id, key, name, is_system, role_permissions(permission_key)")
    .eq("id", id.data)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    key: data.key,
    name: data.name,
    isSystem: data.is_system,
    permissions: data.role_permissions.map((p) => p.permission_key),
  };
}

function ruleActor(actor: SchoolActor) {
  return { roleKey: actor.roleKey, roleId: actor.roleId, permissions: actor.permissions };
}

/** Names are unique in a school (case-insensitive), built-in names included. */
async function nameTaken(schoolId: string, name: string, exceptId?: string): Promise<boolean> {
  let query = createAdminClient().from("roles").select("id").eq("school_id", schoolId).ilike("name", name);
  if (exceptId) query = query.neq("id", exceptId);
  const { data } = await query;
  return (data ?? []).length > 0;
}

function parseName(input: unknown): { name: string } | { error: string } {
  const parsed = roleNameSchema.safeParse(input);
  return parsed.success ? parsed.data : { error: parsed.error.issues[0]?.message ?? "generic" };
}

function audit(actor: SchoolActor, action: string, roleId: string, data: Record<string, unknown>) {
  return logAudit({
    actorId: actor.id,
    schoolId: actor.schoolId,
    action,
    entity: "role",
    entityId: roleId,
    data: JSON.parse(JSON.stringify(data)),
  });
}

/** New custom role, with no permission (they are set on the role's page). */
export async function createRole(input: unknown): Promise<RoleActionResult<{ id: string }>> {
  const actor = await getSchoolActor("roles.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const v = parseName(input);
  if ("error" in v) return { ok: false, error: v.error, field: "name" };
  if (await nameTaken(actor.schoolId, v.name)) return { ok: false, error: "nameTaken", field: "name" };

  const { data, error } = await createAdminClient()
    .from("roles")
    .insert({ school_id: actor.schoolId, key: customRoleKey(), name: v.name, is_system: false })
    .select("id")
    .single();
  if (error) return { ok: false, error: "generic" };

  await audit(actor, "role.create", data.id, { name: v.name });
  return { ok: true, data: { id: data.id } };
}

async function authorize(
  roleId: unknown,
  edit: (role: LoadedRole) => RoleEdit,
): Promise<{ actor: SchoolActor; role: LoadedRole } | { error: string }> {
  const actor = await getSchoolActor("roles.manage");
  if (!actor) return { error: "forbidden" };
  const role = await loadRole(actor.schoolId, roleId);
  if (!role) return { error: "notFound" };
  const denied = roleEditError(ruleActor(actor), role, edit(role));
  return denied ? { error: denied } : { actor, role };
}

export async function renameRole(roleId: unknown, input: unknown): Promise<RoleActionResult<null>> {
  const auth = await authorize(roleId, () => ({ kind: "rename" }));
  if ("error" in auth) return { ok: false, error: auth.error };
  const v = parseName(input);
  if ("error" in v) return { ok: false, error: v.error, field: "name" };
  if (await nameTaken(auth.actor.schoolId, v.name, auth.role.id)) {
    return { ok: false, error: "nameTaken", field: "name" };
  }

  const { error } = await createAdminClient()
    .from("roles")
    .update({ name: v.name })
    .eq("id", auth.role.id)
    .eq("school_id", auth.actor.schoolId);
  if (error) return { ok: false, error: "generic" };

  await audit(auth.actor, "role.rename", auth.role.id, { from: auth.role.name, to: v.name });
  return { ok: true, data: null };
}

/** Replaces the role's permissions with `permissions` (only the difference is written). */
export async function setRolePermissions(roleId: unknown, input: unknown): Promise<RoleActionResult<null>> {
  const parsed = rolePermissionsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalidPermission" };
  const wanted = parsed.data.permissions;

  // Only keys of the catalog.
  const { data: catalog } = await createAdminClient().from("permissions").select("key").in("key", wanted);
  if ((catalog ?? []).length !== wanted.length) return { ok: false, error: "invalidPermission" };

  let added: string[] = [];
  let removed: string[] = [];
  const auth = await authorize(roleId, (role) => {
    added = wanted.filter((p) => !role.permissions.includes(p));
    removed = role.permissions.filter((p) => !wanted.includes(p));
    return { kind: "permissions", added, removed };
  });
  if ("error" in auth) return { ok: false, error: auth.error };
  if (added.length === 0 && removed.length === 0) return { ok: true, data: null };

  const admin = createAdminClient();
  if (removed.length) {
    const { error } = await admin
      .from("role_permissions")
      .delete()
      .eq("role_id", auth.role.id)
      .in("permission_key", removed);
    if (error) return { ok: false, error: "generic" };
  }
  if (added.length) {
    const { error } = await admin
      .from("role_permissions")
      .insert(added.map((permission_key) => ({ role_id: auth.role.id, permission_key })));
    if (error) return { ok: false, error: "generic" };
  }

  await audit(auth.actor, "role.permissions", auth.role.id, { role: auth.role.name, added, removed });
  return { ok: true, data: null };
}

/** Deletes a custom role nobody holds (built-in roles are never deleted). */
export async function deleteRole(roleId: unknown): Promise<RoleActionResult<null>> {
  const actor = await getSchoolActor("roles.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const role = await loadRole(actor.schoolId, roleId);
  if (!role) return { ok: false, error: "notFound" };

  const admin = createAdminClient();
  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role_id", role.id);
  const denied = roleEditError(ruleActor(actor), role, { kind: "delete", memberCount: count ?? 0 });
  if (denied) return { ok: false, error: denied };

  // The FK on profiles.role_id still refuses it if someone got the role meanwhile.
  const { error } = await admin.from("roles").delete().eq("id", role.id).eq("school_id", actor.schoolId);
  if (error) return { ok: false, error: error.code === "23503" ? "roleInUse" : "generic" };

  await audit(actor, "role.delete", role.id, { name: role.name, permissions: role.permissions });
  return { ok: true, data: null };
}
