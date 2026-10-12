// Who may do what to which staff account. Pure functions with NO imports, so
// the security tests can load this exact file (scripts/rls/rules.mjs).
// The Server Actions are the enforcement point; pages use the same rules to
// show only the actions the user may actually take.

/** Family accounts are managed with students (Phase 5), not on the staff pages. */
export const NON_STAFF_ROLE_KEYS = ["parent", "student"] as const;

const NOT_ASSIGNABLE: readonly string[] = ["platform_owner", ...NON_STAFF_ROLE_KEYS];

export type StaffActor = {
  /** Key of the actor's role in their school ("director" = the built-in director role). */
  roleKey: string;
  permissions: ReadonlySet<string>;
};

export type TargetRole = { key: string; permissions: readonly string[] };

export type RoleAssignmentError = "roleInvalid" | "directorOnly" | "roleTooPowerful";

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

export type StaffAction = "edit" | "changeRole" | "resetPassword" | "deactivate" | "reactivate";

/** An existing account of the actor's school (loaded with the school filter). */
export type StaffTarget = {
  id: string;
  roleKey: string;
  /** Permissions of the target's current role. */
  permissions: readonly string[];
  deactivated: boolean;
};

export type StaffActionContext = {
  /** Active (not deactivated) directors of the school other than the target. */
  otherActiveDirectors: number;
  /** For changeRole: key of the new role. */
  newRoleKey?: string;
};

export type StaffActionError =
  | "notFound"
  | "selfRole"
  | "selfPassword"
  | "selfDeactivate"
  | "directorOnly"
  | "roleTooPowerful"
  | "lastDirector"
  | "accountDeactivated";

const SELF_ERRORS: Partial<Record<StaffAction, StaffActionError>> = {
  changeRole: "selfRole",
  resetPassword: "selfPassword",
  deactivate: "selfDeactivate",
  reactivate: "selfDeactivate",
};

/**
 * Why `actor` may not do `action` to `target`, or null if allowed.
 * - only staff accounts are managed here (family accounts: "notFound");
 * - on yourself, only editing your own details;
 * - only a director acts on a director; anyone else only on accounts whose
 *   permissions they hold (resetting a stronger account's password = takeover);
 * - the school always keeps at least one active director;
 * - no password reset for a deactivated account (reactivate first).
 */
export function staffActionError(
  actor: StaffActor & { id: string },
  target: StaffTarget,
  action: StaffAction,
  context: StaffActionContext,
): StaffActionError | null {
  if (NOT_ASSIGNABLE.includes(target.roleKey)) return "notFound";

  if (actor.id === target.id) {
    if (action !== "edit") return SELF_ERRORS[action] ?? "selfRole";
  } else if (actor.roleKey !== "director") {
    if (target.roleKey === "director") return "directorOnly";
    if (target.permissions.some((p) => !actor.permissions.has(p))) return "roleTooPowerful";
  }

  const removesDirector =
    action === "deactivate" || (action === "changeRole" && context.newRoleKey !== "director");
  if (target.roleKey === "director" && !target.deactivated && removesDirector && context.otherActiveDirectors < 1) {
    return "lastDirector";
  }

  if (action === "resetPassword" && target.deactivated) return "accountDeactivated";
  return null;
}
