// Phase 3 step 5 Server Actions (roles & permissions), called over HTTP as
// real users. Actions are registered per page: create on /staff/roles, the
// others on the role's own page.
import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin } from "./fixtures.mjs";

const FILE = "src/lib/roles/actions.ts";

export async function roleActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const ids = Object.fromEntries(
    ["createRole", "renameRole", "setRolePermissions", "deleteRole"].map((n) => [n, actionId(FILE, n)]),
  );
  const cookies = {};
  for (const name of ["dirA", "survA", "mgrA", "radA"]) cookies[name] = await sessionCookies(fx.users[name]);

  const create = (who, name) =>
    callAction(baseUrl, { id: ids.createRole, path: "/fr/staff/roles", args: [{ name }], cookies: cookies[who] });
  const onRole = (who, action, roleId, ...rest) =>
    callAction(baseUrl, { id: ids[action], path: `/fr/staff/roles/${roleId}`, args: [roleId, ...rest], cookies: cookies[who] });
  const expect = async (label, promise, wanted) => {
    const r = await promise;
    const got = r.ok ? "ok" : r.error;
    check(`[P3 action] ${label}`, got === wanted, got);
    return r;
  };
  const permsOf = async (roleId) =>
    ((await admin.from("role_permissions").select("permission_key").eq("role_id", roleId)).data ?? [])
      .map((p) => p.permission_key)
      .sort()
      .join(",");
  const ownerRole = (await admin.from("roles").select("id").is("school_id", null).eq("key", "platform_owner").single()).data.id;
  const name = `RLS role ${fx.run}`;

  // --- Who may manage roles --------------------------------------------------
  await expect("surveillant (no roles.manage) cannot create a role", create("survA", "x"), "forbidden");
  await expect("staff manager without roles.manage cannot create a role", create("mgrA", "x"), "forbidden");

  // --- Create -----------------------------------------------------------------
  const created = await expect("director creates a role", create("dirA", name), "ok");
  const roleId = created.ok ? created.data.id : null;
  if (roleId) {
    const { data: r } = await admin.from("roles").select("school_id, key, is_system").eq("id", roleId).single();
    check("[P3 action] new role is a custom role of the director's school",
      r.school_id === A.id && !r.is_system && /^custom_[a-z]{10}$/.test(r.key), r.key);
  }
  await expect("same name twice is refused", create("dirA", name.toUpperCase()), "nameTaken");
  await expect("a built-in role's name is refused", create("dirA", "Directeur"), "nameTaken");
  await expect("a too-short name is refused", create("dirA", "x"), "nameRequired");
  if (!roleId) return;

  // --- Permissions --------------------------------------------------------------
  const setPerms = (who, id, permissions) => onRole(who, "setRolePermissions", id, { permissions });
  await expect("director grants permissions to the new role", setPerms("dirA", roleId, ["users.view", "audit.view"]), "ok");
  check("[P3 action] the permissions are saved", (await permsOf(roleId)) === "audit.view,users.view", await permsOf(roleId));
  await expect("an unknown permission is refused", setPerms("dirA", roleId, ["fake.permission"]), "invalidPermission");
  await expect("the director role is locked", setPerms("dirA", A.roles.director, ["users.view"]), "directorLocked");
  await expect("another school's role is not found", setPerms("dirA", B.roles.teacher, ["users.view"]), "notFound");
  await expect("the platform_owner role is not found", setPerms("dirA", ownerRole, ["users.view"]), "notFound");
  await expect("a built-in role's permissions can change", setPerms("dirA", A.roles.teacher, ["users.view"]), "ok");
  await expect("…and back", setPerms("dirA", A.roles.teacher, []), "ok");
  await expect("surveillant cannot change permissions", setPerms("survA", roleId, []), "forbidden");

  // Non-director with roles.manage: no privilege escalation.
  await expect("role admin cannot change own role", setPerms("radA", A.roles.role_admin, ["users.view", "roles.manage", "audit.view"]), "ownRole");
  await expect("role admin cannot remove a permission it does not hold", setPerms("radA", roleId, ["users.view"]), "permissionNotHeld");
  await expect("role admin cannot grant a permission it does not hold", setPerms("radA", A.roles.teacher, ["audit.view"]), "permissionNotHeld");
  await expect("role admin cannot touch the director role", setPerms("radA", A.roles.director, []), "directorLocked");
  await expect("role admin grants a permission it holds", setPerms("radA", A.roles.teacher, ["users.view"]), "ok");
  await expect("role admin removes it again", setPerms("radA", A.roles.teacher, []), "ok");

  // --- Rename ---------------------------------------------------------------------
  const rename = (who, id, newName) => onRole(who, "renameRole", id, { name: newName });
  await expect("director renames the custom role", rename("dirA", roleId, `${name} (2)`), "ok");
  await expect("a built-in role cannot be renamed", rename("dirA", A.roles.teacher, "Prof"), "systemRole");
  await expect("the director role cannot be renamed", rename("dirA", A.roles.director, "Boss"), "directorLocked");
  await expect("another school's role cannot be renamed", rename("dirA", B.roles.teacher, "x2"), "notFound");
  await expect("renaming to an existing name is refused", rename("dirA", roleId, "Enseignant"), "nameTaken");

  // --- Delete ---------------------------------------------------------------------
  const del = (who, id) => onRole(who, "deleteRole", id);
  await expect("a built-in role cannot be deleted", del("dirA", A.roles.teacher), "systemRole");
  await expect("a role held by someone cannot be deleted", del("dirA", A.roles.auditor), "roleInUse");
  await expect("another school's role cannot be deleted", del("dirA", B.roles.teacher), "notFound");
  await expect("surveillant cannot delete a role", del("survA", roleId), "forbidden");
  await expect("director deletes the unused custom role", del("dirA", roleId), "ok");
  const { data: gone } = await admin.from("roles").select("id").eq("id", roleId);
  check("[P3 action] the role is gone", (gone ?? []).length === 0, "");

  const actions = ["role.create", "role.permissions", "role.rename", "role.delete"];
  const { data: trail } = await admin.from("audit_logs").select("action").eq("school_id", A.id).in("action", actions);
  check("[P3 action] every role change is in school A's audit log",
    actions.every((a) => trail?.some((row) => row.action === a)), "");
}
