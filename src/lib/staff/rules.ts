// Who may give which role to a staff account. Pure functions (no I/O), used by
// the Server Actions — which are the enforcement point — and by the pages to
// offer only the roles the user may actually assign.

import { NON_STAFF_ROLE_KEYS } from "@/lib/validations/staff";

export type StaffActor = {
  /** Key of the actor's role in their school ("director" = the built-in director role). */
  roleKey: string;
  permissions: ReadonlySet<string>;
};

export type TargetRole = { key: string; permissions: readonly string[] };

export type RoleAssignmentError = "roleInvalid" | "directorOnly" | "roleTooPowerful";

const NOT_ASSIGNABLE: readonly string[] = ["platform_owner", ...NON_STAFF_ROLE_KEYS];

/**
 * Why `actor` may not give `role` to a staff account, or null if allowed.
 * - platform_owner, parent and student are never assignable here;
 * - only a director can make someone a director;
 * - anyone else can only assign roles whose permissions they hold themselves
 *   (no privilege escalation through a custom role).
 * The role must already be known to belong to the actor's school.
 */
export function roleAssignmentError(actor: StaffActor, role: TargetRole): RoleAssignmentError | null {
  if (NOT_ASSIGNABLE.includes(role.key)) return "roleInvalid";
  if (actor.roleKey === "director") return null;
  if (role.key === "director") return "directorOnly";
  if (role.permissions.some((p) => !actor.permissions.has(p))) return "roleTooPowerful";
  return null;
}
