// Launch prep step 2a: plan limits. The database refuses a new student / a new
// admin account beyond what the school's plan (or the platform owner's override)
// allows; teachers, parents, students and drivers are not admin accounts; only
// ADDING is refused (a school over its limit keeps its data); a school without a
// trial / active subscription has no limit here; one school's limit never
// touches another; two inserts at once cannot both slip under the limit.
import { randomBytes } from "node:crypto";

import { check } from "./checks.mjs";
import { admin, anon, signIn } from "./fixtures.mjs";

export async function phaseLaunchLimits({ fx, as }) {
  const A = fx.schools.a;
  const label = (s) => `[Limits] ${s}`;
  const must = (r, what) => {
    if (r.error) throw new Error(`phaseLaunchLimits setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const fails = (r, text) => r.error?.code === "23514" && String(r.error.message).includes(text);

  // --- The plans ------------------------------------------------------------------------------------------
  const plans = Object.fromEntries(
    must(await admin.from("plans").select("*").in("key", ["basic", "pro", "premium"]), "plans").map((p) => [p.key, p]),
  );
  const shape = (p) => [Number(p.price_monthly), Number(p.price_yearly), p.max_students, p.max_admin_accounts].join("/");
  check(label("basic = 290 / 2900 DH, 150 students, 2 admin accounts"), shape(plans.basic) === "290/2900/150/2", shape(plans.basic));
  check(label("pro = 590 / 5900 DH, 400 students, 5 admin accounts"), shape(plans.pro) === "590/5900/400/5", shape(plans.pro));
  check(label("premium = 990 / 9900 DH, 800 students, unlimited admin accounts"), shape(plans.premium) === "990/9900/800/", shape(plans.premium));

  // --- A school on the Basic plan, with a small override so the test stays short ---------------------------
  const school = must(
    await admin
      .from("schools")
      .insert({ name: `RLS limits ${fx.run}`, slug: `rls-test-lim-${fx.run}-${randomBytes(3).toString("hex")}` })
      .select("id")
      .single(),
    "school",
  );
  fx.createdSchoolIds.push(school.id);
  const roles = Object.fromEntries(
    must(await admin.from("roles").select("id, key").eq("school_id", school.id), "roles").map((r) => [r.key, r.id]),
  );
  const sub = must(
    await admin
      .from("school_subscriptions")
      .insert({ school_id: school.id, plan_id: plans.basic.id, status: "trial", max_students_override: 3 })
      .select("id")
      .single(),
    "subscription",
  ).id;
  const setSub = (change) => admin.from("school_subscriptions").update(change).eq("id", sub);

  const student = (n) => ({
    school_id: school.id,
    first_name: "Limit",
    last_name: `TEST${n}`,
    birth_date: "2014-03-02",
    gender: "male",
  });
  const add = (n) => admin.from("students").insert(student(n)).select("id");
  const count = async () =>
    (await admin.from("students").select("id", { count: "exact", head: true }).eq("school_id", school.id)).count;

  // --- Students --------------------------------------------------------------------------------------------
  const ids = [];
  for (const n of [1, 2, 3]) ids.push(must(await add(n), `student ${n}`)[0].id);
  check(label("students up to the override (3) are accepted"), ids.length === 3);
  const fourth = await add(4);
  check(label("the 4th student is refused (plan_student_limit, 23514)"), fails(fourth, "plan_student_limit"), JSON.stringify(fourth.error));
  check(label("the refusal carries the limit (detail)"), String(fourth.error?.details) === "3", String(fourth.error?.details));

  must(await setSub({ max_students_override: 4 }), "raise override");
  check(label("raising the override lets the 4th in"), (await add(4)).error === null);
  must(await setSub({ max_students_override: 2 }), "lower override");
  check(label("lowering the limit below usage keeps the students"), (await count()) === 4);
  check(label("... but adding is still refused"), fails(await add(5), "plan_student_limit"));
  must(await admin.from("students").delete().in("id", ids.slice(0, 3)), "delete students");
  check(label("deleting students frees places (1 of 2 used: adding works)"), (await add(6)).error === null && (await count()) === 2);
  check(label("... and the limit applies again"), fails(await add(7), "plan_student_limit"));

  must(await setSub({ max_students_override: null }), "no override");
  check(label("without an override the plan decides (basic = 150)"), (await add(8)).error === null);

  must(await setSub({ max_students_override: 1 }), "tiny override");
  must(await setSub({ status: "expired" }), "expire");
  check(label("no trial / active subscription = no limit here (expired)"), (await add(9)).error === null);
  must(await setSub({ status: "trial" }), "trial again");
  check(label("trial again = the limit applies"), fails(await add(10), "plan_student_limit"));
  must(await setSub({ max_students_override: 5, status: "active" }), "active");

  // --- Concurrency: 4 inserts at once with 1 place left ---------------------------------------------------
  const have = await count();
  must(await setSub({ max_students_override: have + 1 }), "one place");
  const racing = await Promise.all([11, 12, 13, 14].map((n) => add(n)));
  const accepted = racing.filter((r) => !r.error).length;
  check(label("4 inserts at once with 1 place left: exactly 1 gets in"), accepted === 1 && (await count()) === have + 1, `${accepted} accepted`);

  // --- Admin accounts --------------------------------------------------------------------------------------
  must(await setSub({ max_students_override: null, max_admins_override: 2 }), "admin override");
  const accounts = [];
  const makeProfile = async (roleKey, n) => {
    const email = `rls-test+${fx.run}-lim${n}@example.com`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), `user ${n}`).user;
    fx.createdUserIds.push(user.id);
    const result = await admin.from("profiles").insert({
      id: user.id,
      school_id: school.id,
      role_id: roles[roleKey],
      full_name: `RLS limit ${n}`,
      must_change_password: false,
    });
    accounts.push({ id: user.id, email, password, roleKey });
    return result;
  };
  check(label("1st admin account (director) accepted"), (await makeProfile("director", 1)).error === null);
  check(label("2nd admin account (surveillant) accepted"), (await makeProfile("surveillant", 2)).error === null);
  const third = await makeProfile("accountant", 3);
  check(label("3rd admin account (accountant) refused (plan_admin_limit, 23514)"), fails(third, "plan_admin_limit"), JSON.stringify(third.error));
  check(label("teachers are not admin accounts (accepted at the limit)"), (await makeProfile("teacher", 4)).error === null);
  check(label("parents are not admin accounts (accepted at the limit)"), (await makeProfile("parent", 5)).error === null);

  const teacher = accounts.find((a) => a.roleKey === "teacher");
  const surveillant = accounts.find((a) => a.roleKey === "surveillant");
  const roleChange = await admin.from("profiles").update({ role_id: roles.accountant }).eq("id", teacher.id);
  check(label("a teacher turned into an accountant at the limit is refused"), fails(roleChange, "plan_admin_limit"), JSON.stringify(roleChange.error));
  check(
    label("an admin changing to another admin role is allowed at the limit"),
    (await admin.from("profiles").update({ role_id: roles.accountant }).eq("id", surveillant.id)).error === null,
  );

  must(await admin.from("profiles").update({ deactivated_at: new Date().toISOString() }).eq("id", surveillant.id), "deactivate");
  check(label("a deactivated admin no longer counts (one place free again)"), (await makeProfile("transport_manager", 6)).error === null);
  const reactivate = await admin.from("profiles").update({ deactivated_at: null }).eq("id", surveillant.id);
  check(label("reactivating an admin at the limit is refused"), fails(reactivate, "plan_admin_limit"), JSON.stringify(reactivate.error));
  check(
    label("a teacher can be deactivated and reactivated freely"),
    (await admin.from("profiles").update({ deactivated_at: new Date().toISOString() }).eq("id", teacher.id)).error === null &&
      (await admin.from("profiles").update({ deactivated_at: null }).eq("id", teacher.id)).error === null,
  );

  // --- school_usage(): the caller's own school only -------------------------------------------------------
  const director = accounts.find((a) => a.roleKey === "director");
  const dirS = await signIn(director);
  const mine = (await dirS.rpc("school_usage")).data?.[0];
  check(
    label("school_usage() as the director: this school's students, admin accounts and limits (2 active admins of 2)"),
    mine && mine.students === (await count()) && mine.max_students === 150 && mine.admins === 2 && mine.max_admins === 2,
    JSON.stringify(mine),
  );
  const usageA = (await as.dirA.rpc("school_usage")).data?.[0];
  check(
    label("school A's director sees A's limits (override 5000 / 100), never this school's"),
    usageA?.max_students === 5000 && usageA?.max_admins === 100,
    JSON.stringify(usageA),
  );
  check(label("anonymous visitors cannot call school_usage()"), (await anon().rpc("school_usage")).error !== null);

  // --- One school's limit never touches another's ----------------------------------------------------------
  const inA = await admin.from("students").insert({ ...student(1), school_id: A.id, last_name: "LIMITA" }).select("id");
  check(label("school A can still add a student while the other school is full"), !inA.error, JSON.stringify(inA.error));
  if (inA.data?.[0]) await admin.from("students").delete().eq("id", inA.data[0].id);
}
