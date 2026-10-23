// Launch prep step 2c, Server Actions + pages: a demo session cannot create, invite
// or change accounts through the app (clear `demoLocked`, nothing created), cannot
// change its password, and the platform dashboard leaves the demo school out.
import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin, anon, signIn } from "./fixtures.mjs";
import { ensureDemoSchool } from "./demo-fixture.mjs";
import { randomMobile } from "./phase5-guardians.mjs";

const label = (s) => `[Demo action] ${s}`;

export async function demoActions({ fx, baseUrl }) {
  const demo = await ensureDemoSchool(fx);
  const { demoDir, demoProf, demoParent } = demo.users;
  const dirCookies = await sessionCookies(demoDir);
  const parentCookies = await sessionCookies(demoParent);

  const call = (file, name, path, cookies, ...args) =>
    callAction(baseUrl, { id: actionId(file, name), path, args, cookies });
  const profiles = async () => (await admin.from("profiles").select("id").eq("school_id", demo.id)).data.length;
  const expectDemo = (what, result) =>
    check(label(`${what}: demoLocked`), result.ok === false && result.error === "demoLocked", result.error ?? "ACCEPTED!");

  // --- Staff accounts (also "Nouvel enseignant", same action) ------------------------------------------
  const STAFF = "src/lib/staff/actions.ts";
  const MEMBER = "src/lib/staff/member-actions.ts";
  for (const roleKey of ["surveillant", "teacher"]) {
    const email = `rls-test+${fx.run}-demo${roleKey}@example.com`;
    const r = await call(STAFF, "createStaff", "/fr/staff", dirCookies, {
      fullName: `RLS demo ${roleKey}`, email, roleId: demo.roles[roleKey], phone: "", locale: "fr",
    });
    expectDemo(`createStaff (${roleKey}) as the demo director`, r);
    const { data: authUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    check(label(`... no Auth account was created for ${roleKey}`), !authUsers.users.some((u) => u.email === email));
  }
  expectDemo("resetStaffPassword on the demo teacher", await call(MEMBER, "resetStaffPassword", `/fr/staff/${demoProf.id}`, dirCookies, demoProf.id));
  expectDemo("setStaffActive(false) on the demo teacher", await call(MEMBER, "setStaffActive", `/fr/staff/${demoProf.id}`, dirCookies, demoProf.id, false));
  expectDemo("changeStaffRole on the demo teacher", await call(MEMBER, "changeStaffRole", `/fr/staff/${demoProf.id}`, dirCookies, demoProf.id, { roleId: demo.roles.surveillant }));
  expectDemo("updateStaffDetails on the demo teacher", await call(MEMBER, "updateStaffDetails", `/fr/staff/${demoProf.id}`, dirCookies, demoProf.id, { fullName: "Visitor", phone: "", locale: "fr" }));

  // --- Parent accounts ----------------------------------------------------------------------------------
  // A guardian without an account, added through the demo director's own session (data stays usable).
  const guardian = await (await signIn(demoDir))
    .from("guardians")
    .insert({ school_id: demo.id, last_name: "Demo", first_name: "Invite", phone: randomMobile() })
    .select("id")
    .single();
  check(label("demo director can still add a guardian (no account)"), !guardian.error, guardian.error?.code ?? "");
  const ACCOUNT = "src/lib/parents/account-actions.ts";
  const page = `/fr/parents/${guardian.data?.id}`;
  expectDemo("createParentAccount as the demo director", await call(ACCOUNT, "createParentAccount", page, dirCookies, guardian.data?.id, "fr"));
  expectDemo("resetParentPassword as the demo director", await call(ACCOUNT, "resetParentPassword", page, dirCookies, guardian.data?.id));
  expectDemo("setParentActive(false) as the demo director", await call(ACCOUNT, "setParentActive", page, dirCookies, guardian.data?.id, false));
  check(label("... still exactly the 3 demo accounts"), (await profiles()) === 3, String(await profiles()));

  // --- Own password -------------------------------------------------------------------------------------
  const changed = await call("src/lib/auth/actions.ts", "changePassword", "/fr/change-password", parentCookies,
    { password: "NouveauMotDePasse1", confirm: "NouveauMotDePasse1" }, "fr");
  expectDemo("changePassword as the demo parent", changed);
  const still = await anon().auth.signInWithPassword({ email: demoParent.email, password: demoParent.password });
  check(label("... the demo password still signs in"), !still.error, still.error?.code ?? "");

  // --- Platform dashboard: the demo school is not counted --------------------------------------------------
  const ownerCookies = await sessionCookies(fx.users.owner);
  const res = await fetch(new URL("/fr/platform", baseUrl), { headers: { cookie: ownerCookies }, redirect: "manual" });
  const html = res.status === 200 ? await res.text() : "";
  const stat = (name) => {
    const m = html.match(new RegExp(`data-stat="${name}" data-value="([0-9.]+)"`));
    return m ? Number(m[1]) : null;
  };
  const all = (await admin.from("schools").select("id, is_demo")).data;
  const realSchools = all.filter((s) => !s.is_demo).length;
  check(label("dashboard school count leaves demo schools out"), stat("totalSchools") === realSchools && realSchools < all.length,
    `shown ${stat("totalSchools")}, real ${realSchools}, with demo ${all.length}`);
  const { data: paid } = await admin
    .from("school_subscriptions")
    .select("plan:plans(price_monthly), school:schools!inner(status, is_demo)")
    .eq("status", "active")
    .eq("school.status", "active");
  const mrrReal = paid.filter((s) => !s.school.is_demo).reduce((sum, s) => sum + Number(s.plan?.price_monthly ?? 0), 0);
  const mrrAll = paid.reduce((sum, s) => sum + Number(s.plan?.price_monthly ?? 0), 0);
  check(label("dashboard MRR leaves the demo school's paid subscription out"), stat("mrr") === mrrReal && mrrAll > mrrReal,
    `shown ${stat("mrr")}, real ${mrrReal}, with demo ${mrrAll}`);
}
