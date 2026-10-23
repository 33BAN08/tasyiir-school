// Launch prep step 2b: the 14-day trial. Visitors may send a trial request
// (kind 'trial', e-mail required) but never link it to a school; the platform
// owner's notification says it is a trial. A trial past its end gives no module
// at once; the expiry blocks the school (subscription expired, school suspended
// with reason 'trial_ended', audit row, data kept) and the school's users can
// read that reason; trials without an end date, future trials and demo schools
// are left alone; a reason cannot stay on an active school.
import { randomBytes } from "node:crypto";

import { check } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";
import { removeDemoRequests, testPhone } from "./public-demo-requests.mjs";

export async function phaseLaunchTrial({ fx, as }) {
  const label = (s) => `[Trial] ${s}`;
  const must = (r, what) => {
    if (r.error) throw new Error(`phaseLaunchTrial setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const code = async (query) => (await query).error?.code ?? "none";
  const phone = testPhone();
  const request = (overrides = {}) => ({
    kind: "trial",
    full_name: "RLS Trial Visitor",
    school_name: "RLS École Essai",
    city: "Fès",
    phone,
    email: `rls-test+${fx.run}-trial@example.com`,
    students: "lt200",
    locale: "fr",
    ...overrides,
  });

  try {
    // --- Trial requests ------------------------------------------------------------------------------------
    check(label("a visitor sends a trial request"), (await code(as.anon.from("demo_requests").insert(request()))) === "none");
    check(
      label("a trial request without an e-mail is refused"),
      (await code(as.anon.from("demo_requests").insert(request({ email: null })))) === "23514",
    );
    check(
      label("an unknown kind is refused"),
      (await code(as.anon.from("demo_requests").insert(request({ kind: "quote" })))) === "23514",
    );
    check(
      label("a visitor cannot link a request to a school"),
      (await code(as.anon.from("demo_requests").insert(request({ school_id: fx.schools.a.id })))) === "42501",
    );
    const stored = must(await admin.from("demo_requests").select("kind, school_id").eq("phone", phone), "stored");
    check(label("stored as a trial, no school"), stored.length === 1 && stored[0].kind === "trial" && stored[0].school_id === null);
    const notes = must(
      await admin.from("notifications").select("data").eq("type", "demo_request").eq("data->>phone", phone),
      "notifications",
    );
    check(label("the platform owner's notification says 'trial'"), notes.length > 0 && notes.every((n) => n.data.kind === "trial"));
    check(label("a school director reads no request"), ((await as.dirA.from("demo_requests").select("id")).data ?? []).length === 0);

    // --- A trial school with its director ------------------------------------------------------------------
    const pro = must(await admin.from("plans").select("id").eq("key", "pro").single(), "plan pro");
    const makeSchool = async (tag, extra = {}) => {
      const school = must(
        await admin
          .from("schools")
          .insert({ name: `RLS trial ${tag} ${fx.run}`, slug: `rls-test-tr${tag}-${fx.run}-${randomBytes(3).toString("hex")}` })
          .select("id")
          .single(),
        `school ${tag}`,
      );
      fx.createdSchoolIds.push(school.id);
      const sub = must(
        await admin
          .from("school_subscriptions")
          .insert({ school_id: school.id, plan_id: pro.id, status: "trial", max_students_override: 50, ...extra })
          .select("id")
          .single(),
        `subscription ${tag}`,
      );
      return { id: school.id, sub: sub.id };
    };
    const inAnHour = new Date(Date.now() + 3600_000).toISOString();
    const T = await makeSchool("t", { trial_ends_at: inAnHour });

    const role = must(await admin.from("roles").select("id").eq("school_id", T.id).eq("key", "director").single(), "role");
    const director = { email: `rls-test+${fx.run}-trialdir@example.com`, password: `Trial${randomBytes(6).toString("hex")}1` };
    const user = must(
      await admin.auth.admin.createUser({ email: director.email, password: director.password, email_confirm: true }),
      "director",
    ).user;
    fx.createdUserIds.push(user.id);
    must(
      await admin
        .from("profiles")
        .insert({ id: user.id, school_id: T.id, role_id: role.id, full_name: "RLS Trial Director", must_change_password: false }),
      "director profile",
    );
    const dir = await signIn(director);
    const rules = async () => ((await dir.from("alert_rules").select("id")).data ?? []).length;

    check(label("during the trial: the plan's modules are on (alert rules readable)"), (await rules()) === 2);
    must(await admin.from("school_subscriptions").update({ trial_ends_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", T.sub), "end");
    check(label("trial past its end: no module, even before the expiry runs"), (await rules()) === 0);
    check(label("…the school is still active until the expiry runs"), (await dir.rpc("my_school_suspension")).data === null);

    // --- Expiry ---------------------------------------------------------------------------------------------
    const noEnd = await makeSchool("n");
    const future = await makeSchool("f", { trial_ends_at: inAnHour });
    const demo = await makeSchool("d", { trial_ends_at: new Date(Date.now() - 60_000).toISOString() });
    must(await admin.from("schools").update({ is_demo: true }).eq("id", demo.id), "demo flag");
    const ids = [T.id, noEnd.id, future.id, demo.id];

    check(label("only the secret key runs the expiry"), (await code(dir.rpc("run_trial_expiry", { p_now: new Date().toISOString(), p_schools: ids }))) === "42501");
    const expired = must(await admin.rpc("run_trial_expiry", { p_now: new Date().toISOString(), p_schools: ids }), "expiry");
    check(label("one trial expired"), expired === 1, String(expired));
    const school = (id) => admin.from("schools").select("status, suspended_at, suspension_reason").eq("id", id).single();
    const subOf = async (id) => must(await admin.from("school_subscriptions").select("status").eq("school_id", id).single(), "sub").status;
    const t = must(await school(T.id), "T");
    check(label("expired trial: school suspended, reason trial_ended"), t.status === "suspended" && t.suspended_at && t.suspension_reason === "trial_ended");
    check(label("expired trial: subscription expired"), (await subOf(T.id)) === "expired");
    const audit = must(await admin.from("audit_logs").select("action").eq("school_id", T.id).eq("action", "school.trial_expired"), "audit");
    check(label("expired trial: written to the audit log"), audit.length === 1);
    check(label("its director reads the reason"), (await dir.rpc("my_school_suspension")).data === "trial_ended");
    check(label("…and nothing of the school any more"), ((await dir.from("schools").select("id").eq("id", T.id)).data ?? []).length === 0);
    for (const [name, s] of [["no end date", noEnd], ["future end", future], ["demo school", demo]]) {
      const row = must(await school(s.id), name);
      check(label(`${name}: untouched`), row.status === "active" && row.suspension_reason === null && (await subOf(s.id)) === "trial");
    }
    check(label("running again changes nothing"), must(await admin.rpc("run_trial_expiry", { p_now: new Date().toISOString(), p_schools: ids }), "again") === 0);
    check(
      label("a school outside the list is never expired"),
      must(await admin.rpc("run_trial_expiry", { p_now: new Date(Date.now() + 7200_000).toISOString(), p_schools: [noEnd.id] }), "outside") === 0 &&
        (await subOf(future.id)) === "trial",
    );
    check(label("the reason is not readable by another school's user"), (await as.dirA.rpc("my_school_suspension")).data === null);

    // --- Reopening ------------------------------------------------------------------------------------------
    check(
      label("a reason cannot stay on an active school"),
      (await code(admin.from("schools").update({ status: "active", suspended_at: null }).eq("id", T.id))) === "23514",
    );
    check(
      label("reactivated with the reason cleared"),
      (await code(admin.from("schools").update({ status: "active", suspended_at: null, suspension_reason: null }).eq("id", T.id))) === "none",
    );
    check(label("…the director's school is readable again"), ((await dir.from("schools").select("id").eq("id", T.id)).data ?? []).length === 1);
  } finally {
    await removeDemoRequests([phone]);
  }
}
