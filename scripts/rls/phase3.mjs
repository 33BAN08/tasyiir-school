// Phase 3: staff accounts, roles & permissions, deactivation (database level).
// Server Action rules (who may create/edit/deactivate whom) are tested in
// actions.mjs once those actions exist.
import { allowed, check, denied, rows } from "./checks.mjs";
import { admin, anon, deactivate, usersOf } from "./fixtures.mjs";

export async function phase3({ fx, as }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const { dirA, survA } = as;
  const ownerRoleId = (
    await admin.from("roles").select("id").is("school_id", null).eq("key", "platform_owner").single()
  ).data.id;

  // A custom role in school B, to attack from school A.
  const { data: customB } = await admin
    .from("roles")
    .insert({ school_id: B.id, key: "secretary", name: "Secrétaire" })
    .select("id")
    .single();

  // --- Staff list visibility -------------------------------------------------
  const staffOfA = usersOf(fx, "a").length;
  await rows(`[P3] dirA lists the ${staffOfA} staff of school A, with emails`,
    dirA.from("profiles").select("id, email").eq("school_id", A.id),
    (r) => r.length === staffOfA && r.every((p) => p.email));
  const staffList = (client, schoolId) =>
    client.from("profiles").select("id, role:roles!inner(key)").eq("school_id", schoolId)
      .not("role.key", "in", "(parent,student)");
  await rows("[P3] staff list query as dirA for school B returns nothing", staffList(dirA, B.id), 0);
  await rows("[P3] staff list query as dirA filtered on B's director role returns nothing",
    dirA.from("profiles").select("id").eq("role_id", B.roles.director), 0);
  await rows("[P3] staff list query as surveillant returns only self", staffList(survA, A.id),
    (r) => r.length === 1 && r[0].id === fx.users.survA.id);
  await rows("[P3] surveillant (no users.view) sees only own profile",
    survA.from("profiles").select("id"), (r) => r.length === 1 && r[0].id === fx.users.survA.id);

  // --- Profiles: privileged columns are server-only --------------------------
  const self = (patch) => dirA.from("profiles").update(patch).eq("id", fx.users.dirA.id).select("id");
  await denied("[P3] dirA cannot change own role_id directly", self({ role_id: A.roles.teacher }));
  await denied("[P3] dirA cannot give self the platform_owner role", self({ role_id: ownerRoleId }));
  await denied("[P3] dirA cannot move self to school B", self({ school_id: B.id }));
  await denied("[P3] dirA cannot change own email column", self({ email: "x@example.com" }));
  await denied("[P3] dirA cannot write deactivated_at", self({ deactivated_at: new Date().toISOString() }));
  await denied("[P3] dirA cannot clear must_change_password", self({ must_change_password: true }));
  await denied("[P3] dirA cannot edit a staff profile directly (server action only)",
    dirA.from("profiles").update({ full_name: "x" }).eq("id", fx.users.survA.id).select("id"));
  await denied("[P3] dirA cannot edit dirB's profile",
    dirA.from("profiles").update({ full_name: "x" }).eq("id", fx.users.dirB.id).select("id"));
  await denied("[P3] dirA cannot insert a profile",
    dirA.from("profiles").insert({ id: fx.users.dirB.id, school_id: A.id, role_id: A.roles.teacher, full_name: "x" })
      .select("id"));

  // --- platform_owner can never belong to a school ---------------------------
  const { error: ownerOnSchool } = await admin
    .from("profiles").update({ role_id: ownerRoleId }).eq("id", fx.users.survA.id);
  check("[P3] DB refuses platform_owner role on a school profile (even with secret key)",
    Boolean(ownerOnSchool), ownerOnSchool ? "refused by trigger" : "ACCEPTED!");
  await denied("[P3] dirA cannot create a school role keyed platform_owner",
    dirA.from("roles").insert({ school_id: A.id, key: "platform_owner", name: "x" }).select("id"));

  // --- Roles & permissions ---------------------------------------------------
  const { data: customA } = await dirA
    .from("roles").insert({ school_id: A.id, key: "secretary", name: "Secrétaire" }).select("id").single();
  check("[P3] dirA can create a custom role in school A", Boolean(customA));
  if (customA) {
    await denied("[P3] dirA cannot re-key own custom role to platform_owner",
      dirA.from("roles").update({ key: "platform_owner" }).eq("id", customA.id).select("id"));
    await allowed("[P3] dirA can rename own custom role",
      dirA.from("roles").update({ name: "Secrétariat" }).eq("id", customA.id).select("id"));
    await allowed("[P3] dirA can grant a permission to own custom role",
      dirA.from("role_permissions").insert({ role_id: customA.id, permission_key: "users.view" }).select("role_id"));
    await allowed("[P3] dirA can delete own custom role",
      dirA.from("roles").delete().eq("id", customA.id).select("id"));
  }
  await denied("[P3] dirA cannot create a role in school B",
    dirA.from("roles").insert({ school_id: B.id, key: "spy", name: "x" }).select("id"));
  await denied("[P3] dirA cannot rename B's custom role",
    dirA.from("roles").update({ name: "x" }).eq("id", customB.id).select("id"));
  await denied("[P3] dirA cannot delete B's custom role", dirA.from("roles").delete().eq("id", customB.id).select("id"));
  await denied("[P3] dirA cannot grant permissions on B's role",
    dirA.from("role_permissions").insert({ role_id: customB.id, permission_key: "users.manage" }).select("role_id"));
  await denied("[P3] dirA cannot rename a built-in role",
    dirA.from("roles").update({ name: "x" }).eq("id", A.roles.teacher).select("id"));
  await denied("[P3] dirA cannot delete a built-in role",
    dirA.from("roles").delete().eq("id", A.roles.surveillant).select("id"));
  await denied("[P3] dirA cannot change the director role's permissions",
    dirA.from("role_permissions").delete().eq("role_id", A.roles.director).select("role_id"));
  await allowed("[P3] dirA can grant a permission to the built-in surveillant role",
    dirA.from("role_permissions").insert({ role_id: A.roles.surveillant, permission_key: "audit.view" })
      .select("role_id"));
  await allowed("[P3] dirA can revoke it again",
    dirA.from("role_permissions").delete().eq("role_id", A.roles.surveillant).eq("permission_key", "audit.view")
      .select("role_id"));
  await denied("[P3] surveillant (no roles.manage) cannot create a role",
    survA.from("roles").insert({ school_id: A.id, key: "spy", name: "x" }).select("id"));
  await denied("[P3] surveillant cannot grant itself users.manage",
    survA.from("role_permissions").insert({ role_id: A.roles.surveillant, permission_key: "users.manage" })
      .select("role_id"));

  // --- Deactivation: access cut immediately, even with a valid JWT ----------
  const deact = as.deactA; // signed in BEFORE being deactivated
  await rows("[P3] before: deactA sees school A", deact.from("schools").select("id"), 1);
  await deactivate(fx.users.deactA);
  await rows("[P3] deactivated (old JWT) sees no school", deact.from("schools").select("id"), 0);
  await rows("[P3] deactivated (old JWT) sees no school roles",
    deact.from("roles").select("id").eq("school_id", A.id), 0);
  await rows("[P3] deactivated (old JWT) sees only own profile", deact.from("profiles").select("id"),
    (r) => r.length === 1 && r[0].id === fx.users.deactA.id);
  await rows("[P3] deactivated (old JWT) sees no subscription", deact.from("school_subscriptions").select("id"), 0);
  const { error: banned } = await anon().auth.signInWithPassword({
    email: fx.users.deactA.email,
    password: fx.users.deactA.password,
  });
  check("[P3] deactivated user cannot sign in again", banned?.code === "user_banned", banned?.code ?? "SIGNED IN!");
  await rows("[P3] dirA still sees the deactivated profile, flagged",
    dirA.from("profiles").select("deactivated_at").eq("id", fx.users.deactA.id),
    (r) => r.length === 1 && r[0].deactivated_at !== null);
}
