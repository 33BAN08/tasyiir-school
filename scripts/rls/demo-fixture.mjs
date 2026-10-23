// A demo school for the test suites (launch prep step 2c): school "d" of the run
// (slug rls-test-d-<run>, so cleanup-run.mjs finds it), with the accounts of the real
// demo school: director, the demo teacher (e-mail ending in "prof"), five more
// teachers (...arabe, ...francais, ...sciences, ...histoire, ...anglais: private.demo_fill
// finds them by that ending) and a parent, plus a demo contact card in its settings,
// then flagged is_demo. Created once per run, on first use (empty until a reset fills
// it). removeFixtures() clears the flag before deleting it.
import { admin, must, password } from "./fixtures.mjs";

export async function ensureDemoSchool(fx) {
  if (fx.demo) return fx.demo;

  const plan = must(await admin.from("plans").select("id").eq("key", "pro").single(), "pro plan");
  const school = must(
    await admin
      .from("schools")
      .insert({
        name: `RLS test D (demo) ${fx.run}`,
        slug: `rls-test-d-${fx.run}`,
        settings: { demo_contact: { phone: "+212522000000", whatsapp: "+212600000000" } },
      })
      .select("id")
      .single(),
    "demo school",
  );
  fx.createdSchoolIds.push(school.id);
  const roles = must(await admin.from("roles").select("id, key").eq("school_id", school.id), "demo roles");
  const roleId = Object.fromEntries(roles.map((r) => [r.key, r.id]));
  // Active (paid) subscription: the platform dashboard must still leave it out of the MRR.
  must(
    await admin.from("school_subscriptions").insert({ school_id: school.id, plan_id: plan.id, status: "active", max_students_override: 5000 }),
    "demo subscription",
  );

  const users = {};
  for (const [name, roleKey] of [
    ["demoDir", "director"], ["demoProf", "teacher"], ["demoParent", "parent"],
    ["demoArabe", "teacher"], ["demoFrancais", "teacher"], ["demoSciences", "teacher"],
    ["demoHistoire", "teacher"], ["demoAnglais", "teacher"],
  ]) {
    const email = `rls-test+${fx.run}-${name.toLowerCase()}@example.com`;
    const pw = password();
    const created = must(await admin.auth.admin.createUser({ email, password: pw, email_confirm: true }), `user ${name}`);
    fx.createdUserIds.push(created.user.id);
    must(
      await admin.from("profiles").insert({
        id: created.user.id,
        school_id: school.id,
        role_id: roleId[roleKey],
        full_name: `RLS ${name}`,
        email,
        must_change_password: false,
      }),
      `profile ${name}`,
    );
    users[name] = { id: created.user.id, email, password: pw, schoolKey: "d" };
    fx.users[name] = users[name];
  }

  must(await admin.from("schools").update({ is_demo: true }).eq("id", school.id), "flag demo");
  fx.demo = { id: school.id, roles: roleId, users };
  return fx.demo;
}
