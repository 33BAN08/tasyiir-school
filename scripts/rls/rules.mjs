// Unit checks of src/lib/staff/rules.ts (the exact file the Server Actions
// use; loaded with Node's TypeScript type stripping). Covers cases that
// cannot be reached over HTTP, e.g. the last active director.
import { check } from "./checks.mjs";

const { roleAssignmentError, staffActionError } = await import("../../src/lib/staff/rules.ts");

const director = { id: "dir", roleKey: "director", permissions: new Set(["users.view", "users.manage", "roles.manage"]) };
const manager = { id: "mgr", roleKey: "office_manager", permissions: new Set(["users.view", "users.manage"]) };
const target = (roleKey, permissions = [], extra = {}) => ({ id: "t", roleKey, permissions, deactivated: false, ...extra });
const ctx = (otherActiveDirectors, newRoleKey) => ({ otherActiveDirectors, newRoleKey });

function expect(name, actual, wanted) {
  check(`[P3 rule] ${name}`, actual === wanted, `${actual ?? "allowed"}`);
}

// --- roleAssignmentError --------------------------------------------------
expect("nobody assigns platform_owner (director)", roleAssignmentError(director, { key: "platform_owner", permissions: [] }), "roleInvalid");
expect("nobody assigns platform_owner (manager)", roleAssignmentError(manager, { key: "platform_owner", permissions: [] }), "roleInvalid");
expect("parent is not a staff role", roleAssignmentError(director, { key: "parent", permissions: [] }), "roleInvalid");
expect("director assigns director", roleAssignmentError(director, { key: "director", permissions: ["roles.manage"] }), null);
expect("manager cannot assign director", roleAssignmentError(manager, { key: "director", permissions: [] }), "directorOnly");
expect("manager cannot assign a stronger role", roleAssignmentError(manager, { key: "auditor", permissions: ["audit.view"] }), "roleTooPowerful");
expect("manager assigns a role within own rights", roleAssignmentError(manager, { key: "teacher", permissions: ["users.view"] }), null);

// --- staffActionError: self -------------------------------------------------
const self = target("director", [], { id: "dir" });
expect("director edits own details", staffActionError(director, self, "edit", ctx(1)), null);
expect("director cannot change own role", staffActionError(director, self, "changeRole", ctx(1, "teacher")), "selfRole");
expect("director cannot reset own password here", staffActionError(director, self, "resetPassword", ctx(1)), "selfPassword");
expect("director cannot deactivate self (even with other directors)", staffActionError(director, self, "deactivate", ctx(3)), "selfDeactivate");

// --- staffActionError: last active director --------------------------------
expect("cannot deactivate the last active director", staffActionError(director, target("director"), "deactivate", ctx(0)), "lastDirector");
expect("can deactivate a director when another is active", staffActionError(director, target("director"), "deactivate", ctx(1)), null);
expect("cannot demote the last active director", staffActionError(director, target("director"), "changeRole", ctx(0, "teacher")), "lastDirector");
expect("director → director is not a demotion", staffActionError(director, target("director"), "changeRole", ctx(0, "director")), null);
expect("reactivating a director is always fine",
  staffActionError(director, target("director", [], { deactivated: true }), "reactivate", ctx(0)), null);
expect("a deactivated director does not count as the last one",
  staffActionError(director, target("director", [], { deactivated: true }), "changeRole", ctx(0, "teacher")), null);

// --- staffActionError: who acts on whom -------------------------------------
for (const action of ["edit", "changeRole", "resetPassword", "deactivate"]) {
  expect(`manager cannot ${action} a director`, staffActionError(manager, target("director"), action, ctx(1, "teacher")), "directorOnly");
  expect(`manager cannot ${action} a stronger account`,
    staffActionError(manager, target("auditor", ["audit.view"]), action, ctx(1, "teacher")), "roleTooPowerful");
  expect(`manager can ${action} a teacher`, staffActionError(manager, target("teacher"), action, ctx(1, "teacher")), null);
}
expect("family accounts are not managed here", staffActionError(director, target("parent"), "edit", ctx(1)), "notFound");
expect("platform_owner is never a target", staffActionError(director, target("platform_owner"), "deactivate", ctx(1)), "notFound");
expect("no password reset for a deactivated account",
  staffActionError(director, target("teacher", [], { deactivated: true }), "resetPassword", ctx(1)), "accountDeactivated");
