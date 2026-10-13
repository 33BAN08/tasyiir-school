// Phase 3 step 6: database guards that back up the Server Action rules.
// - Every school keeps at least one active director (trigger, even with the secret key).
// - role_permissions: a non-director role admin cannot touch their own role and
//   can only grant/remove permissions they hold (direct API calls).
import { allowed, check, denied } from "./checks.mjs";
import { admin } from "./fixtures.mjs";

export async function phase3Guards({ fx, as }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const u = fx.users;
  const { radA } = as;

  // --- At least one active director (school B has only dirB) -----------------
  const profile = (id, patch) => admin.from("profiles").update(patch).eq("id", id).select("id");
  const refused = async (label, query) => {
    const { error } = await query;
    check(`[P3 guard] ${label}`, error?.hint === "last_active_director", error ? error.hint ?? error.code : "ACCEPTED!");
  };
  await refused("cannot demote the only director of school B (secret key)", profile(u.dirB.id, { role_id: B.roles.teacher }));
  await refused("cannot deactivate the only director of school B",
    profile(u.dirB.id, { deactivated_at: new Date().toISOString() }));
  await refused("cannot move the only director of school B to school A",
    profile(u.dirB.id, { school_id: A.id, role_id: A.roles.director }));

  // School A has two active directors (dirA, pendA): one may go, not both.
  await allowed("[P3 guard] can deactivate a director while another stays active",
    profile(u.pendA.id, { deactivated_at: new Date().toISOString() }));
  await refused("cannot then deactivate the last one", profile(u.dirA.id, { deactivated_at: new Date().toISOString() }));
  await refused("cannot then demote the last one", profile(u.dirA.id, { role_id: A.roles.teacher }));
  await allowed("[P3 guard] can reactivate the other director", profile(u.pendA.id, { deactivated_at: null }));
  await allowed("[P3 guard] the last-director rule does not block a non-director",
    profile(u.tchA.id, { full_name: "RLS tchA" }));

  // --- No privilege escalation through role_permissions (radA: users.view + roles.manage)
  const grant = (roleId, permission) =>
    radA.from("role_permissions").insert({ role_id: roleId, permission_key: permission }).select("role_id");
  const revoke = (roleId, permission) =>
    radA.from("role_permissions").delete().eq("role_id", roleId).eq("permission_key", permission).select("role_id");

  await denied("[P3 guard] role admin cannot add a permission to own role", grant(A.roles.role_admin, "audit.view"));
  await denied("[P3 guard] role admin cannot remove a permission from own role", revoke(A.roles.role_admin, "users.view"));
  await denied("[P3 guard] role admin cannot grant a permission they do not hold", grant(A.roles.surveillant, "audit.view"));
  await denied("[P3 guard] role admin cannot remove a permission they do not hold", revoke(A.roles.auditor, "audit.view"));
  await allowed("[P3 guard] role admin can grant a held permission to another role",
    grant(A.roles.surveillant, "roles.manage"));
  await allowed("[P3 guard] role admin can remove it again", revoke(A.roles.surveillant, "roles.manage"));
  await denied("[P3 guard] role admin cannot touch another school's role", grant(B.roles.surveillant, "users.view"));
}
