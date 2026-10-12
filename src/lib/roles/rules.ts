// Who may change which role, and how. Pure functions with NO imports, so the
// security tests can load this exact file (scripts/rls/rules.mjs). The Server
// Actions enforce them; the pages use them to show only allowed actions.

export type RoleActor = {
  /** Key of the actor's own role ("director" = the built-in director role). */
  roleKey: string;
  roleId: string;
  permissions: ReadonlySet<string>;
};

export type ManagedRole = { id: string; key: string; isSystem: boolean };

export type RoleEdit =
  | { kind: "rename" }
  | { kind: "delete"; memberCount: number }
  /** Permissions added and removed by the change. */
  | { kind: "permissions"; added: readonly string[]; removed: readonly string[] };

export type RoleEditError =
  | "notFound"
  | "directorLocked"
  | "systemRole"
  | "roleInUse"
  | "ownRole"
  | "permissionNotHeld";

/** Roles that are not managed on the staff pages (portal / platform roles). */
const NOT_MANAGED: readonly string[] = ["platform_owner", "parent", "student"];

/**
 * Why `actor` may not make `edit` to `role`, or null if allowed.
 * - the built-in director role is locked (nobody can lock directors out);
 * - built-in roles cannot be renamed or deleted (their permissions can change);
 * - a role still held by someone cannot be deleted;
 * - someone who is not a director cannot change their own role, and can only
 *   grant or remove permissions they hold themselves (no privilege escalation).
 * The role must already be known to belong to the actor's school.
 */
export function roleEditError(actor: RoleActor, role: ManagedRole, edit: RoleEdit): RoleEditError | null {
  if (NOT_MANAGED.includes(role.key)) return "notFound";
  if (role.isSystem && role.key === "director") return "directorLocked";
  if (role.isSystem && edit.kind !== "permissions") return "systemRole";
  if (edit.kind === "delete" && edit.memberCount > 0) return "roleInUse";

  if (actor.roleKey !== "director") {
    if (role.id === actor.roleId) return "ownRole";
    if (edit.kind === "permissions") {
      const touched = [...edit.added, ...edit.removed];
      if (touched.some((p) => !actor.permissions.has(p))) return "permissionNotHeld";
    }
  }
  return null;
}

/** Key of a new custom role: never a built-in key (prefix), unique by randomness. */
export function customRoleKey(random: () => number = Math.random): string {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  let suffix = "";
  for (let i = 0; i < 10; i++) suffix += letters[Math.floor(random() * letters.length)];
  return `custom_${suffix}`;
}
