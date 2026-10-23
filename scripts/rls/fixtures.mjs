// Temporary fixtures for the RLS tests: created with the secret key, removed
// at the end. Passwords are random and never printed.
// First: refuses to go on against production (see guard.mjs).
import "./guard.mjs";

import { randomBytes } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL || !PUBLISHABLE || !SECRET) {
  throw new Error("Run with: node --env-file=.env.local scripts/rls/run.mjs");
}

const NO_SESSION = { auth: { persistSession: false, autoRefreshToken: false } };

export const admin = createClient(URL, SECRET, NO_SESSION);
export const anon = () => createClient(URL, PUBLISHABLE, NO_SESSION);

const run = randomBytes(4).toString("hex");
const password = () => `${randomBytes(18).toString("base64url")}a1`;

function must({ data, error }, what) {
  if (error) throw new Error(`fixture: ${what} failed (${error.code ?? error.message})`);
  return data;
}

export async function createFixtures() {
  const fx = { run, schools: {}, users: {}, createdUserIds: [], createdSchoolIds: [] };

  const plan = must(await admin.from("plans").select("id").eq("key", "basic").single(), "plan");
  const ownerRole = must(
    await admin.from("roles").select("id").is("school_id", null).eq("key", "platform_owner").single(),
    "owner role",
  );

  for (const key of ["a", "b", "c"]) {
    const school = must(
      await admin
        .from("schools")
        .insert({ name: `RLS test ${key.toUpperCase()} ${run}`, slug: `rls-test-${key}-${run}` })
        .select("id")
        .single(),
      `school ${key}`,
    );
    fx.createdSchoolIds.push(school.id);
    const roles = must(await admin.from("roles").select("id, key").eq("school_id", school.id), "roles");
    fx.schools[key] = { id: school.id, roles: Object.fromEntries(roles.map((r) => [r.key, r.id])) };

    must(
      await admin.from("school_subscriptions").insert({ school_id: school.id, plan_id: plan.id, status: "trial", max_students_override: 5000, max_admins_override: 100 }),
      "subscription",
    );
    must(
      await admin.from("school_modules").insert({ school_id: school.id, module_key: "grades", enabled: true }),
      "module override",
    );
    must(
      await admin.from("audit_logs").insert({ school_id: school.id, action: "rls.test", entity: "school" }),
      "audit",
    );
  }

  // Custom roles in school A: a non-director staff manager, and a role with a
  // permission that manager does not hold (privilege-escalation checks).
  for (const [key, name, permissions] of [
    ["office_manager", "Office manager", ["users.view", "users.manage"]],
    ["auditor", "Auditor", ["audit.view"]],
    ["role_admin", "Role admin", ["users.view", "roles.manage"]],
  ]) {
    const role = must(
      await admin.from("roles").insert({ school_id: fx.schools.a.id, key, name }).select("id").single(),
      `role ${key}`,
    );
    must(
      await admin.from("role_permissions").insert(permissions.map((p) => ({ role_id: role.id, permission_key: p }))),
      `role ${key} permissions`,
    );
    fx.schools.a.roles[key] = role.id;
  }

  // [name, school, role, must_change_password]
  const people = [
    ["dirA", "a", "director", false],
    ["survA", "a", "surveillant", false],
    ["deactA", "a", "surveillant", false],
    ["mgrA", "a", "office_manager", false],
    ["audA", "a", "auditor", false],
    ["tchA", "a", "teacher", false],
    ["radA", "a", "role_admin", false],
    ["pendA", "a", "director", true],
    ["dirB", "b", "director", false],
    ["dirC", "c", "director", false],
    ["owner", null, null, false],
  ];
  for (const [name, schoolKey, roleKey, mustChange] of people) {
    const email = `rls-test+${run}-${name.toLowerCase()}@example.com`;
    const pw = password();
    const created = must(
      await admin.auth.admin.createUser({ email, password: pw, email_confirm: true }),
      `user ${name}`,
    );
    fx.createdUserIds.push(created.user.id);
    const school = schoolKey ? fx.schools[schoolKey] : null;
    must(
      await admin.from("profiles").insert({
        id: created.user.id,
        school_id: school?.id ?? null,
        role_id: school ? school.roles[roleKey] : ownerRole.id,
        full_name: `RLS ${name}`,
        email,
        must_change_password: mustChange,
      }),
      `profile ${name}`,
    );
    fx.users[name] = { id: created.user.id, email, password: pw, schoolKey };
  }

  // School C is suspended.
  must(
    await admin
      .from("schools")
      .update({ status: "suspended", suspended_at: new Date().toISOString() })
      .eq("id", fx.schools.c.id),
    "suspend C",
  );

  return fx;
}

/** Signed-in client for a fixture user. */
export async function signIn(user) {
  const client = anon();
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw new Error(`sign-in failed for fixture user (${error.code})`);
  return client;
}

/** Deactivate like the app does: profile flag + Auth ban. */
export async function deactivate(user) {
  must(
    await admin.from("profiles").update({ deactivated_at: new Date().toISOString() }).eq("id", user.id),
    "deactivate",
  );
  must(await admin.auth.admin.updateUserById(user.id, { ban_duration: "876000h" }), "ban");
}

/** Fixture users of one school ("a", "b", "c"). */
export function usersOf(fx, schoolKey) {
  return Object.values(fx.users).filter((u) => u.schoolKey === schoolKey);
}

export async function removeFixtures(fx) {
  const leftovers = [];
  // Accounts created by the tests themselves (e.g. createStaff) live in the fixture schools.
  const { data: extra } = await admin.from("profiles").select("id").in("school_id", fx.createdSchoolIds);
  const ids = new Set([...fx.createdUserIds, ...(extra ?? []).map((p) => p.id)]);
  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) leftovers.push(`user ${id}`);
  }
  for (const id of fx.createdSchoolIds) {
    const { error } = await admin.from("schools").delete().eq("id", id);
    if (error) leftovers.push(`school ${id}`);
  }
  return leftovers;
}
