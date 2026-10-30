// Phase 13 step 1: fee setup — fee_years (billing months, due day),
// fee_plans (registration + monthly per level), fee_services, student_services
// and student_discounts. Reads: fees.view (director, accountant) while the fees
// module is on. Writes: fees.manage, except discounts: fees.cancel (director
// only), each discount change logged in audit_logs. Parents, students and
// staff without the permission read nothing.
import { randomBytes } from "node:crypto";

import { check, denied, rows } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";

export async function phase13FeeSetup({ fx, as }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const label = (s) => `[P13 setup] ${s}`;
  const must = (r, what) => {
    if (r.error) throw new Error(`phase13FeeSetup setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (q, what) => must(await q.select("id").single(), what).id;
  const refusedWith = (name, error, expected) =>
    check(label(`refused: ${name}`), !!error && (error.code === expected || error.message === expected),
      error ? `${error.code} ${error.message}` : "accepted!");

  // --- Permissions in the role templates -------------------------------------------------------------------
  const templatePerms = async (key) => (await admin.from("roles")
    .select("key, role_permissions(permission_key)").is("school_id", null).eq("key", key).single())
    .data?.role_permissions.map((p) => p.permission_key).filter((p) => p.startsWith("fees.")).sort() ?? [];
  const dirPerms = await templatePerms("director");
  const accPerms = await templatePerms("accountant");
  check(label("director template: fees.cancel + fees.manage + fees.view"),
    dirPerms.join() === "fees.cancel,fees.manage,fees.view", dirPerms.join());
  check(label("accountant template: fees.manage + fees.view, no fees.cancel"),
    accPerms.join() === "fees.manage,fees.view", accPerms.join());
  const survPerms = await templatePerms("surveillant");
  check(label("surveillant template: no fees permission"), survPerms.length === 0, survPerms.join());

  // --- Fees module on for A and B (fixtures are on the Basic plan) -----------------------------------------
  must(await admin.from("school_modules").insert([
    { school_id: A.id, module_key: "fees", enabled: true },
    { school_id: B.id, module_key: "fees", enabled: true },
  ]), "fees module");

  // --- Fixtures: far-future years, levels, a class, enrolled students -------------------------------------
  const yearA = await id(admin.from("academic_years").insert({
    school_id: A.id, label: `P13-${fx.run}`, start_date: "2070-09-01", end_date: "2071-06-30", is_current: false,
  }), "year A");
  const yearA2 = await id(admin.from("academic_years").insert({
    school_id: A.id, label: `P13-next-${fx.run}`, start_date: "2071-09-01", end_date: "2072-06-30", is_current: false,
  }), "year A2");
  const yearB = await id(admin.from("academic_years").insert({
    school_id: B.id, label: `P13-${fx.run}`, start_date: "2070-09-01", end_date: "2071-06-30", is_current: false,
  }), "year B");
  const levelA = await id(admin.from("levels").insert({ school_id: A.id, cycle: "college", name: `P13 1AC ${fx.run}` }), "level A");
  const levelA2 = await id(admin.from("levels").insert({ school_id: A.id, cycle: "college", name: `P13 2AC ${fx.run}` }), "level A2");
  const levelB = await id(admin.from("levels").insert({ school_id: B.id, cycle: "college", name: `P13 B ${fx.run}` }), "level B");
  const classA = await id(admin.from("classes").insert({
    school_id: A.id, academic_year_id: yearA, level_id: levelA, name: `P13-A ${fx.run}` }), "class A");
  const classB = await id(admin.from("classes").insert({
    school_id: B.id, academic_year_id: yearB, level_id: levelB, name: `P13-B ${fx.run}` }), "class B");
  const student = async (school, name) =>
    id(admin.from("students").insert({ school_id: school, first_name: name, last_name: `P13 ${fx.run}`, birth_date: "2014-01-01", gender: "male" }), `student ${name}`);
  const amine = await student(A.id, "Amine");
  const sara = await student(A.id, "Sara");          // in school A, not enrolled this year
  const omar = await student(B.id, "Omar");
  must(await admin.from("student_enrollments").insert([
    { school_id: A.id, student_id: amine, academic_year_id: yearA, class_id: classA },
    { school_id: B.id, student_id: omar, academic_year_id: yearB, class_id: classB },
  ]), "enrollments");

  // Accounts of school A this suite needs: accountant, parent, student.
  const account = async (key, role) => {
    const email = `rls-test+${fx.run}-p13${key}@example.com`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), key).user;
    fx.createdUserIds.push(user.id);
    must(await admin.from("profiles").insert({
      id: user.id, school_id: A.id, role_id: A.roles[role], full_name: `RLS p13${key}`, must_change_password: false,
    }), `${key} profile`);
    return { id: user.id, client: await signIn({ email, password }) };
  };
  const acc = await account("acc", "accountant");
  const par = await account("par", "parent");
  const stu = await account("stu", "student");
  const accA = acc.client;

  // --- fee_years + fee_year_rules -----------------------------------------------------------------------------
  const { data: defaults, error: defaultsError } = await as.dirA.rpc("fee_year_rules", { p_year: yearA });
  const expectedDefault = ["2070-09-01", "2070-10-01", "2070-11-01", "2070-12-01", "2071-01-01",
    "2071-02-01", "2071-03-01", "2071-04-01", "2071-05-01", "2071-06-01"];
  check(label("fee_year_rules with no row: September → June, due on the 5th, not customised"),
    !defaultsError && defaults?.length === 1 && defaults[0].billing_months.join() === expectedDefault.join()
      && defaults[0].due_day === 5 && defaults[0].customised === false,
    defaultsError?.code ?? JSON.stringify(defaults));
  const odd = await id(admin.from("academic_years").insert({
    school_id: A.id, label: `P13-odd-${fx.run}`, start_date: "2073-02-15", end_date: "2073-12-31", is_current: false,
  }), "odd year");
  const { data: oddRules } = await as.dirA.rpc("fee_year_rules", { p_year: odd });
  check(label("a year starting mid-February: defaults clipped to February → June"),
    oddRules?.[0]?.billing_months.join() === "2073-02-01,2073-03-01,2073-04-01,2073-05-01,2073-06-01",
    JSON.stringify(oddRules));
  must(await admin.from("academic_years").delete().eq("id", odd), "odd year delete");
  for (const [who, client] of [["a surveillant", as.survA], ["a teacher", as.tchA], ["a parent", par.client],
    ["the director of B", as.dirB]]) {
    await rows(label(`fee_year_rules: ${who} gets nothing for A's year`), client.rpc("fee_year_rules", { p_year: yearA }), 0);
  }
  const { data: anonRules, error: anonRpc } = await as.anon.rpc("fee_year_rules", { p_year: yearA });
  check(label("fee_year_rules signed out: refused"), !!anonRpc || (anonRules ?? []).length === 0,
    anonRpc?.code ?? `${anonRules?.length} row(s)`);

  const feeYear = (client, values) => client.from("fee_years")
    .insert({ school_id: A.id, academic_year_id: yearA, billing_months: ["2071-06-01", "2070-09-01", "2070-10-01"], due_day: 10, ...values })
    .select("*");
  await denied(label("a surveillant cannot set the fee months"), feeYear(as.survA, {}));
  await denied(label("a teacher cannot set the fee months"), feeYear(as.tchA, {}));
  await denied(label("a parent cannot set the fee months"), feeYear(par.client, {}));
  for (const [name, values, code] of [
    ["a month not on the 1st", { billing_months: ["2070-09-02"] }, "fees_billing_months_invalid"],
    ["a month before the year", { billing_months: ["2070-08-01"] }, "fees_billing_months_invalid"],
    ["a month after the year", { billing_months: ["2071-07-01"] }, "fees_billing_months_invalid"],
    ["the same month twice", { billing_months: ["2070-09-01", "2070-09-01"] }, "fees_billing_months_invalid"],
    ["an empty month", { billing_months: ["2070-09-01", null] }, "fees_billing_months_invalid"],
    ["no month", { billing_months: [] }, "23514"],
    ["due day 29", { due_day: 29 }, "23514"],
    ["due day 0", { due_day: 0 }, "23514"],
  ]) {
    const { error } = await feeYear(as.dirA, values);
    refusedWith(`fee months: ${name}`, error, code);
  }
  const { error: crossYear } = await feeYear(as.dirA, { academic_year_id: yearB });
  check(label("the director of A cannot set fee months on B's year"), !!crossYear, crossYear?.code ?? "accepted!");
  const { data: fy, error: fyError } = await feeYear(as.dirA, {});
  check(label("the director sets the fee months (stored sorted, who recorded)"),
    !fyError && fy?.[0]?.billing_months.join() === "2070-09-01,2070-10-01,2071-06-01"
      && fy[0].due_day === 10 && fy[0].updated_by === fx.users.dirA.id,
    fyError?.code ?? JSON.stringify(fy));
  const { data: custom } = await as.dirA.rpc("fee_year_rules", { p_year: yearA });
  check(label("fee_year_rules returns the school's own months"),
    custom?.[0]?.customised === true && custom[0].due_day === 10 && custom[0].billing_months.length === 3,
    JSON.stringify(custom));
  const { data: accYear, error: accYearError } = await accA.from("fee_years").update({ due_day: 7 })
    .eq("academic_year_id", yearA).select("due_day, updated_by");
  check(label("the accountant changes the due day (who recorded)"),
    !accYearError && accYear?.[0]?.due_day === 7 && accYear[0].updated_by === acc.id,
    accYearError?.code ?? JSON.stringify(accYear));
  await denied(label("the director of B cannot change A's fee months"),
    as.dirB.from("fee_years").update({ due_day: 3 }).eq("academic_year_id", yearA).select("due_day"));
  await denied(label("the director cannot move fee months to another school (no grant)"),
    as.dirA.from("fee_years").update({ school_id: B.id }).eq("academic_year_id", yearA).select("due_day"));

  // --- fee_plans --------------------------------------------------------------------------------------------
  const plan = (client, values) => client.from("fee_plans")
    .insert({ school_id: A.id, academic_year_id: yearA, level_id: levelA, registration_centimes: 150000, monthly_centimes: 120000, ...values })
    .select("*");
  await denied(label("a surveillant cannot add a fee plan"), plan(as.survA, {}));
  await denied(label("an office manager cannot add a fee plan"), plan(as.mgrA, {}));
  await denied(label("a parent cannot add a fee plan"), plan(par.client, {}));
  for (const [name, values] of [["a negative registration", { registration_centimes: -1 }],
    ["a negative monthly fee", { monthly_centimes: -100 }], ["a monthly fee over 100 000 DH", { monthly_centimes: 10000001 }]]) {
    const { error } = await plan(accA, values);
    refusedWith(`fee plan: ${name}`, error, "23514");
  }
  const { error: planCrossLevel } = await plan(accA, { level_id: levelB });
  check(label("refused: a fee plan on B's level"), !!planCrossLevel, planCrossLevel?.code ?? "accepted!");
  const { data: planRow, error: planError } = await plan(accA, {});
  check(label("the accountant adds the 1AC plan: 1 500 DH + 1 200 DH / month (who recorded)"),
    !planError && planRow?.[0]?.monthly_centimes === 120000 && planRow[0].updated_by === acc.id,
    planError?.code ?? JSON.stringify(planRow));
  const { error: planTwice } = await plan(as.dirA, {});
  refusedWith("the same level twice in a year", planTwice, "23505");
  const { data: planNext, error: planNextError } = await plan(as.dirA, { academic_year_id: yearA2, level_id: levelA2 });
  check(label("the director adds a plan for next year"), !planNextError && planNext?.length === 1, planNextError?.code ?? "");
  const { data: planUpd } = await as.dirA.from("fee_plans").update({ monthly_centimes: 125000 })
    .eq("id", planRow[0].id).select("monthly_centimes");
  check(label("the director changes the monthly fee"), planUpd?.[0]?.monthly_centimes === 125000, JSON.stringify(planUpd));
  await denied(label("the accountant cannot move a plan to another level (no grant)"),
    accA.from("fee_plans").update({ level_id: levelA2 }).eq("id", planRow[0].id).select("id"));
  await denied(label("the director of B cannot change A's plan"),
    as.dirB.from("fee_plans").update({ monthly_centimes: 1 }).eq("id", planRow[0].id).select("id"));
  await denied(label("a surveillant cannot delete a plan"), as.survA.from("fee_plans").delete().eq("id", planNext[0].id).select("id"));
  const { data: planGone } = await accA.from("fee_plans").delete().eq("id", planNext[0].id).select("id");
  check(label("the accountant deletes next year's plan"), planGone?.length === 1);

  // --- fee_services -----------------------------------------------------------------------------------------
  const service = (client, values) => client.from("fee_services")
    .insert({ school_id: A.id, academic_year_id: yearA, name: "Transport", name_ar: "النقل", monthly_centimes: 40000, ...values })
    .select("*");
  await denied(label("a surveillant cannot add a service"), service(as.survA, {}));
  await denied(label("a teacher cannot add a service"), service(as.tchA, {}));
  for (const [name, values] of [["an empty name", { name: "  " }], ["a negative price", { monthly_centimes: -1 }],
    ["position 101", { position: 101 }]]) {
    const { error } = await service(accA, values);
    refusedWith(`service: ${name}`, error, "23514");
  }
  const { data: transport, error: transportError } = await service(accA, {});
  check(label("the accountant adds Transport, 400 DH / month"), !transportError && transport?.length === 1, transportError?.code ?? "");
  const { error: serviceTwice } = await service(accA, { monthly_centimes: 1 });
  refusedWith("the same service name twice in a year", serviceTwice, "23505");
  const nextService = must(await service(accA, { academic_year_id: yearA2, name: "Cantine" }), "next year service");
  const { data: serviceUpd } = await accA.from("fee_services").update({ active: false, monthly_centimes: 45000 })
    .eq("id", transport[0].id).select("active, monthly_centimes");
  check(label("the accountant changes the price and deactivates it"),
    serviceUpd?.[0]?.active === false && serviceUpd[0].monthly_centimes === 45000, JSON.stringify(serviceUpd));
  must(await accA.from("fee_services").update({ active: true }).eq("id", transport[0].id).select("id"), "reactivate");
  await denied(label("the director of B cannot change A's service"),
    as.dirB.from("fee_services").update({ monthly_centimes: 1 }).eq("id", transport[0].id).select("id"));

  // --- student_services -------------------------------------------------------------------------------------
  const subscribe = (client, values) => client.from("student_services")
    .insert({ school_id: A.id, academic_year_id: yearA, student_id: amine, service_id: transport[0].id, from_month: "2070-09-01", to_month: "2070-12-01", ...values })
    .select("*");
  await denied(label("a surveillant cannot subscribe a student to a service"), subscribe(as.survA, {}));
  await denied(label("a parent cannot subscribe a student to a service"), subscribe(par.client, {}));
  for (const [name, values, code] of [
    ["a month not on the 1st", { from_month: "2070-09-15" }, "23514"],
    ["an end before the start", { from_month: "2070-12-01", to_month: "2070-10-01" }, "23514"],
    ["a start before the year", { from_month: "2070-08-01" }, "fees_month_outside_year"],
    ["an end after the year", { to_month: "2071-07-01" }, "fees_month_outside_year"],
    ["a student not enrolled this year", { student_id: sara }, "fees_student_not_enrolled"],
    ["a service of another year", { service_id: nextService[0].id }, "23503"],
  ]) {
    const { error } = await subscribe(accA, values);
    refusedWith(`service period: ${name}`, error, code);
  }
  const { error: crossStudent } = await subscribe(accA, { student_id: omar });
  check(label("refused: B's student on A's service"), !!crossStudent, crossStudent?.code ?? "accepted!");
  const { data: sub, error: subError } = await subscribe(accA, {});
  check(label("the accountant subscribes Amine to Transport, September → December"),
    !subError && sub?.length === 1 && sub[0].updated_by === acc.id, subError?.code ?? JSON.stringify(sub));
  const { error: overlap } = await subscribe(accA, { from_month: "2070-12-01", to_month: null });
  refusedWith("two periods of the same service overlapping", overlap, "23P01");
  const { data: sub2, error: sub2Error } = await subscribe(accA, { from_month: "2071-03-01", to_month: null });
  check(label("a second period from March to the end of the year"), !sub2Error && sub2?.length === 1, sub2Error?.code ?? "");
  const { error: overlapOpen } = await accA.from("student_services").update({ to_month: "2071-04-01" })
    .eq("id", sub[0].id).select("id");
  refusedWith("stretching the first period over the second", overlapOpen, "23P01");
  await denied(label("the accountant cannot move a period to another student (no grant)"),
    accA.from("student_services").update({ student_id: sara }).eq("id", sub[0].id).select("id"));
  await denied(label("the director of B cannot delete A's period"),
    as.dirB.from("student_services").delete().eq("id", sub2[0].id).select("id"));
  const { data: subGone } = await accA.from("student_services").delete().eq("id", sub2[0].id).select("id");
  check(label("the accountant deletes the second period"), subGone?.length === 1);

  // --- student_discounts: director only (fees.cancel), every change logged ----------------------------------
  const discount = (client, values) => client.from("student_discounts")
    .insert({ school_id: A.id, academic_year_id: yearA, student_id: amine, kind: "sibling", percent_bp: 1000, applies_to: "tuition", reason: "2e enfant", ...values })
    .select("*");
  const discountLogs = async () => (await admin.from("audit_logs").select("action, actor_id, entity_id, data")
    .eq("school_id", A.id).eq("entity", "student_discount").order("id")).data ?? [];

  await denied(label("the accountant cannot create a discount"), discount(accA, {}));
  await denied(label("a surveillant cannot create a discount"), discount(as.survA, {}));
  await denied(label("a parent cannot create a discount"), discount(par.client, {}));
  for (const [name, values, code] of [
    ["both a percent and an amount", { amount_centimes: 10000 }, "23514"],
    ["neither a percent nor an amount", { percent_bp: null }, "23514"],
    ["kind fixed with a percent", { kind: "fixed" }, "23514"],
    ["0 %", { percent_bp: 0 }, "23514"],
    ["over 100 %", { percent_bp: 10001 }, "23514"],
    ["an amount of 0", { percent_bp: null, amount_centimes: 0 }, "23514"],
    ["an unknown kind", { kind: "friend" }, "23514"],
    ["an unknown target", { applies_to: "books" }, "23514"],
    ["a 201-character reason", { reason: "x".repeat(201) }, "23514"],
    ["a student not enrolled this year", { student_id: sara }, "fees_student_not_enrolled"],
  ]) {
    const { error } = await discount(as.dirA, values);
    refusedWith(`discount: ${name}`, error, code);
  }
  const { error: crossDiscount } = await discount(as.dirA, { student_id: omar });
  check(label("refused: a discount for B's student"), !!crossDiscount, crossDiscount?.code ?? "accepted!");
  check(label("refused discounts leave no audit row"), (await discountLogs()).length === 0);

  const { data: sib, error: sibError } = await discount(as.dirA, {});
  check(label("the director creates a 10 % sibling discount (who recorded)"),
    !sibError && sib?.[0]?.created_by === fx.users.dirA.id && sib[0].updated_by === fx.users.dirA.id,
    sibError?.code ?? JSON.stringify(sib));
  const { error: sibTwice } = await discount(as.dirA, { percent_bp: 500 });
  refusedWith("the same kind twice for a student and year", sibTwice, "23505");
  const { data: fixed, error: fixedError } = await discount(as.dirA, {
    kind: "fixed", percent_bp: null, amount_centimes: 10000, applies_to: "all", reason: null });
  check(label("the director creates a fixed 100 DH discount"), !fixedError && fixed?.length === 1, fixedError?.code ?? "");

  await rows(label("the accountant reads the discounts"),
    accA.from("student_discounts").select("id").eq("student_id", amine), 2);
  await denied(label("the accountant cannot edit a discount"),
    accA.from("student_discounts").update({ percent_bp: 5000 }).eq("id", sib[0].id).select("id"));
  await denied(label("the accountant cannot delete a discount"),
    accA.from("student_discounts").delete().eq("id", fixed[0].id).select("id"));
  await denied(label("the director of B cannot edit A's discount"),
    as.dirB.from("student_discounts").update({ percent_bp: 5000 }).eq("id", sib[0].id).select("id"));
  await denied(label("the director cannot change who created a discount (no grant)"),
    as.dirA.from("student_discounts").update({ created_by: acc.id }).eq("id", sib[0].id).select("id"));
  const { data: sibUpd, error: sibUpdError } = await as.dirA.from("student_discounts")
    .update({ percent_bp: 1500, reason: "3e enfant" }).eq("id", sib[0].id).select("percent_bp, created_by");
  check(label("the director edits the discount to 15 % (creator kept)"),
    !sibUpdError && sibUpd?.[0]?.percent_bp === 1500 && sibUpd[0].created_by === fx.users.dirA.id,
    sibUpdError?.code ?? JSON.stringify(sibUpd));
  must(await as.dirA.from("student_discounts").update({ percent_bp: 1500 }).eq("id", sib[0].id).select("id"), "same values");
  const { data: fixedGone } = await as.dirA.from("student_discounts").delete().eq("id", fixed[0].id).select("id");
  check(label("the director deletes the fixed discount"), fixedGone?.length === 1);

  const logs = await discountLogs();
  const [logIns, logIns2, logUpd, logDel] = logs;
  check(label("audit: 4 discount rows (2 creates, 1 edit, 1 delete; the no-change save adds none)"),
    logs.map((l) => l.action).join() === "fee_discount.insert,fee_discount.insert,fee_discount.update,fee_discount.delete",
    logs.map((l) => l.action).join());
  check(label("audit: every row names the director and the discount"),
    logs.length === 4 && logs.every((l) => l.actor_id === fx.users.dirA.id)
      && logIns?.entity_id === sib[0].id && logIns2?.entity_id === fixed[0].id
      && logUpd?.entity_id === sib[0].id && logDel?.entity_id === fixed[0].id
      && logs.every((l) => l.data.student_id === amine && l.data.academic_year_id === yearA),
    JSON.stringify(logs.map((l) => [l.action, l.actor_id === fx.users.dirA.id, l.entity_id])));
  check(label("audit: the edit holds the old and new values"),
    logUpd?.data.old?.percent_bp === 1000 && logUpd.data.new?.percent_bp === 1500
      && logUpd.data.old.reason === "2e enfant" && logUpd.data.new.reason === "3e enfant",
    JSON.stringify(logUpd?.data));
  check(label("audit: the create has no old values, the delete no new ones"),
    logIns?.data.old === null && logIns.data.new?.percent_bp === 1000
      && logDel?.data.new === null && logDel.data.old?.amount_centimes === 10000 && logDel.data.kind === "fixed",
    JSON.stringify([logIns?.data, logDel?.data]));

  // --- Reads: who sees A's fee setup ------------------------------------------------------------------------
  const tables = ["fee_years", "fee_plans", "fee_services", "student_services", "student_discounts"];
  for (const t of tables) {
    await rows(label(`${t}: the director reads A's rows only`), as.dirA.from(t).select("school_id"),
      (list) => list.length > 0 && list.every((r) => r.school_id === A.id));
    await rows(label(`${t}: the accountant reads A's rows`), accA.from(t).select("school_id"),
      (list) => list.length > 0 && list.every((r) => r.school_id === A.id));
    for (const [who, client] of [["a surveillant", as.survA], ["a teacher", as.tchA], ["an office manager", as.mgrA],
      ["an auditor", as.audA], ["a parent", par.client], ["a student", stu.client], ["suspended school C's director", as.dirC],
      ["the platform owner", as.owner]]) {
      await rows(label(`${t}: ${who} reads nothing`), client.from(t).select("school_id"), 0);
    }
    await rows(label(`${t}: the director of B reads none of A's rows`),
      as.dirB.from(t).select("school_id").eq("school_id", A.id), 0);
    const { data: anonRows, error: anonError } = await as.anon.from(t).select("school_id");
    check(label(`${t}: signed out reads nothing (no grant)`), anonError?.code === "42501" || anonRows?.length === 0,
      anonError?.code ?? `${anonRows?.length} row(s)`);
  }

  // --- Module off → nothing read or written ------------------------------------------------------------------
  must(await admin.from("fee_plans").insert({ school_id: B.id, academic_year_id: yearB, level_id: levelB, monthly_centimes: 100000 }), "B plan");
  must(await admin.from("school_modules").update({ enabled: false }).eq("school_id", B.id).eq("module_key", "fees"), "B fees off");
  await rows(label("fees module off: the director of B reads no plan"), as.dirB.from("fee_plans").select("id"), 0);
  await rows(label("fees module off: fee_year_rules returns nothing"), as.dirB.rpc("fee_year_rules", { p_year: yearB }), 0);
  await denied(label("fees module off: the director of B cannot change a plan"),
    as.dirB.from("fee_plans").update({ monthly_centimes: 1 }).eq("school_id", B.id).select("id"));
  await denied(label("fees module off: the director of B cannot add a service"),
    as.dirB.from("fee_services").insert({ school_id: B.id, academic_year_id: yearB, name: "X", monthly_centimes: 1 }).select("id"));
  must(await admin.from("school_modules").update({ enabled: true }).eq("school_id", B.id).eq("module_key", "fees"), "B fees on");
  await rows(label("fees module back on: the director of B reads B's plan"), as.dirB.from("fee_plans").select("id"), 1);

  // --- Deleting the year takes its setup with it (no audit row, no failure) ---------------------------------
  must(await as.dirA.from("student_discounts").insert({
    school_id: A.id, academic_year_id: yearA, student_id: amine, kind: "scholarship", percent_bp: 5000, applies_to: "all",
  }).select("id"), "scholarship");
  const logsBefore = (await discountLogs()).length;
  // Classes hold their year (on delete restrict): enrollments and class first.
  must(await admin.from("student_enrollments").delete().in("class_id", [classA, classB]), "enrollments delete");
  must(await admin.from("classes").delete().in("id", [classA, classB]), "classes delete");
  must(await admin.from("academic_years").delete().eq("id", yearA), "year A delete");
  const left = await Promise.all(tables.map(async (t) =>
    (await admin.from(t).select("*", { count: "exact", head: true }).eq("academic_year_id", yearA)).count));
  check(label("deleting a year deletes its fee months, plans, services, periods and discounts"),
    left.every((n) => n === 0), left.join(", "));
  check(label("…without a discount audit row for the cascade"), (await discountLogs()).length === logsBefore,
    `${(await discountLogs()).length} vs ${logsBefore}`);

  // --- Cleanup ----------------------------------------------------------------------------------------------
  must(await admin.from("academic_years").delete().in("id", [yearA2, yearB]), "years delete");
  await admin.from("students").delete().in("id", [amine, sara, omar]);
  await admin.from("levels").delete().in("id", [levelA, levelA2, levelB]);
  await admin.from("school_modules").delete().in("school_id", [A.id, B.id]).eq("module_key", "fees");
}
