// Phase 1–2: tenant isolation (school A vs B), platform-only tables,
// suspended school, anonymous access.
import { allowed, denied, rows } from "./checks.mjs";
import { usersOf } from "./fixtures.mjs";

export async function phase2({ fx, as }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const C = fx.schools.c;
  const dirA = as.dirA;

  // --- Anonymous: nothing at all -------------------------------------------
  for (const table of ["schools", "profiles", "roles", "school_subscriptions", "audit_logs"]) {
    await denied(`[P2] anon cannot read ${table}`, as.anon.from(table).select("*").limit(1));
  }

  // --- Director A reads only school A --------------------------------------
  await rows("[P2] dirA sees only school A", dirA.from("schools").select("id"), (r) =>
    r.length === 1 && r[0].id === A.id);
  await rows("[P2] dirA cannot read school B by id", dirA.from("schools").select("id").eq("id", B.id), 0);
  await rows("[P2] dirA sees only A's subscription", dirA.from("school_subscriptions").select("school_id"),
    (r) => r.length === 1 && r[0].school_id === A.id);
  await rows("[P2] dirA cannot read B's module overrides",
    dirA.from("school_modules").select("*").eq("school_id", B.id), 0);
  await rows("[P2] dirA cannot read B's roles", dirA.from("roles").select("id").eq("school_id", B.id), 0);
  await rows("[P2] dirA cannot read B's role permissions",
    dirA.from("role_permissions").select("role_id").eq("school_id", B.id), 0);
  await rows("[P2] dirA cannot read B's profiles", dirA.from("profiles").select("id").eq("school_id", B.id), 0);
  await rows("[P2] dirA cannot read dirB's profile by id",
    dirA.from("profiles").select("id").eq("id", fx.users.dirB.id), 0);
  await rows("[P2] dirA audit log = school A only", dirA.from("audit_logs").select("school_id"),
    (r) => r.length > 0 && r.every((x) => x.school_id === A.id));

  // --- Director A cannot write platform tables ------------------------------
  await denied("[P2] dirA cannot rename own school",
    dirA.from("schools").update({ name: "hacked" }).eq("id", A.id).select("id"));
  await denied("[P2] dirA cannot rename school B",
    dirA.from("schools").update({ name: "hacked" }).eq("id", B.id).select("id"));
  await denied("[P2] dirA cannot un-suspend school C",
    dirA.from("schools").update({ status: "active", suspended_at: null }).eq("id", C.id).select("id"));
  await denied("[P2] dirA cannot create a school",
    dirA.from("schools").insert({ name: "x", slug: `rls-x-${fx.run}` }).select("id"));
  await denied("[P2] dirA cannot delete own school", dirA.from("schools").delete().eq("id", A.id).select("id"));
  await denied("[P2] dirA cannot change plan prices",
    dirA.from("plans").update({ price_monthly: 1 }).eq("key", "basic").select("id"));
  await denied("[P2] dirA cannot create a plan",
    dirA.from("plans").insert({ key: `rls_${fx.run.replace(/\d/g, "x")}`, name: "x" }).select("id"));
  await denied("[P2] dirA cannot change plan modules",
    dirA.from("plan_modules").delete().eq("module_key", "attendance").select("plan_id"));
  await denied("[P2] dirA cannot extend own subscription",
    dirA.from("school_subscriptions").update({ status: "active" }).eq("school_id", A.id).select("id"));
  await denied("[P2] dirA cannot enable a module for own school",
    dirA.from("school_modules").insert({ school_id: A.id, module_key: "fees", enabled: true }).select("school_id"));
  await denied("[P2] dirA cannot write audit logs",
    dirA.from("audit_logs").insert({ school_id: A.id, action: "forged" }).select("id"));
  await denied("[P2] dirA cannot erase audit logs",
    dirA.from("audit_logs").delete().eq("school_id", A.id).select("id"));

  // --- Suspended school C: no tenant data, own profile only -----------------
  await rows("[P2] dirC (suspended) sees no school", as.dirC.from("schools").select("id"), 0);
  await rows("[P2] dirC (suspended) sees no school roles",
    as.dirC.from("roles").select("id").not("school_id", "is", null), 0);
  await rows("[P2] dirC (suspended) sees only own profile", as.dirC.from("profiles").select("id"),
    (r) => r.length === 1 && r[0].id === fx.users.dirC.id);
  await rows("[P2] dirC (suspended) sees no audit log", as.dirC.from("audit_logs").select("id"), 0);

  // --- Platform owner --------------------------------------------------------
  const owner = as.owner;
  await rows("[P2] owner sees schools A, B and C",
    owner.from("schools").select("id").in("id", [A.id, B.id, C.id]), 3);
  await rows("[P2] owner sees profiles of every school",
    owner.from("profiles").select("id").in("school_id", [A.id, B.id, C.id]),
    ["a", "b", "c"].reduce((n, key) => n + usersOf(fx, key).length, 0));
  await allowed("[P2] owner can rename a school",
    owner.from("schools").update({ name: `RLS test A ${fx.run} (renamed)` }).eq("id", A.id).select("id"));
  await denied("[P2] owner cannot hard-delete a school",
    owner.from("schools").delete().eq("id", B.id).select("id"));
  await rows("[P2] school B still exists", owner.from("schools").select("id").eq("id", B.id), 1);
}
