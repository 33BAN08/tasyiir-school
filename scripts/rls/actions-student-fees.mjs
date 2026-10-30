// Phase 13 step 2 Server Actions + page (the student page's "Frais" card):
// services of a student (add, change months, remove — fees.manage) and
// discounts (add, change, delete — fees.cancel, director only), called over
// HTTP as real users on the student page. The accountant handles services but
// is refused every discount write; discount changes land in audit_logs
// (database trigger) with the director as the actor.
import { randomBytes } from "node:crypto";

import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin } from "./fixtures.mjs";
import { randomMobile } from "./phase5-guardians.mjs";

const FILE = "src/lib/fees/student-actions.ts";
const ACTIONS = ["addStudentService", "updateStudentService", "removeStudentService", "saveStudentDiscount", "deleteStudentDiscount"];

export async function studentFeesActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const label = (s) => `[P13 student fees action] ${s}`;
  const must = (r, what) => {
    if (r.error) throw new Error(`studentFeesActions setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (q, what) => must(await q.select("id").single(), what).id;

  // --- Fixtures: fees on for A and B, an accountant, A's current year = a far-future one ------------------
  must(await admin.from("school_modules").insert([
    { school_id: A.id, module_key: "fees", enabled: true },
    { school_id: B.id, module_key: "fees", enabled: true },
  ]), "fees module");
  const email = `rls-test+${fx.run}-sfacc@example.com`;
  const password = `${randomBytes(12).toString("base64url")}a1`;
  const accUser = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), "accountant").user;
  fx.createdUserIds.push(accUser.id);
  must(await admin.from("profiles").insert({
    id: accUser.id, school_id: A.id, role_id: A.roles.accountant, full_name: "RLS sfacc", must_change_password: false,
  }), "accountant profile");

  const ids = Object.fromEntries(ACTIONS.map((name) => [name, actionId(FILE, name)]));
  const cookies = { accA: await sessionCookies({ email, password }) };
  for (const name of ["dirA", "survA", "tchA", "dirB"]) cookies[name] = await sessionCookies(fx.users[name]);

  const { data: before } = await admin.from("academic_years").select("id").eq("school_id", A.id).eq("is_current", true).maybeSingle();
  const year = await id(admin.from("academic_years").insert({
    school_id: A.id, label: `SF-${fx.run}`, start_date: "2080-09-01", end_date: "2081-06-30", is_current: false,
  }), "year");
  if (before) must(await admin.from("academic_years").update({ is_current: false }).eq("id", before.id), "old current off");
  must(await admin.from("academic_years").update({ is_current: true }).eq("id", year), "current year");
  const yearB = await id(admin.from("academic_years").insert({
    school_id: B.id, label: `SF-${fx.run}`, start_date: "2080-09-01", end_date: "2081-06-30", is_current: false,
  }), "year B");
  const level = await id(admin.from("levels").insert({ school_id: A.id, cycle: "college", name: `SF 1AC ${fx.run}` }), "level");
  const cls = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name: `SF-A ${fx.run}` }), "class");
  const kid = (name) => id(admin.from("students").insert({
    school_id: A.id, first_name: name, last_name: `SF ${fx.run}`, birth_date: "2014-01-01", gender: "male" }), name);
  const amine = await kid("Amine");
  const sara = await kid("Sara");     // Amine's sister, enrolled
  const nadia = await kid("Nadia");   // not enrolled this year
  must(await admin.from("student_enrollments").insert([
    { school_id: A.id, student_id: amine, academic_year_id: year, class_id: cls },
    { school_id: A.id, student_id: sara, academic_year_id: year, class_id: cls },
  ]), "enrollments");
  const guardian = await id(admin.from("guardians").insert({
    school_id: A.id, first_name: "Karim", last_name: `SF ${fx.run}`, phone: randomMobile() }), "guardian");
  must(await admin.from("student_guardians").insert([
    { school_id: A.id, student_id: amine, guardian_id: guardian, relation: "father" },
    { school_id: A.id, student_id: sara, guardian_id: guardian, relation: "father" },
  ]), "guardian links");
  must(await admin.from("fee_plans").insert({
    school_id: A.id, academic_year_id: year, level_id: level, registration_centimes: 150000, monthly_centimes: 120000 }), "plan");
  const transport = await id(admin.from("fee_services").insert({
    school_id: A.id, academic_year_id: year, name: "Transport", monthly_centimes: 40000 }), "transport");
  const studentB = await id(admin.from("students").insert({
    school_id: B.id, first_name: "Omar", last_name: `SF ${fx.run}`, birth_date: "2014-01-01", gender: "male" }), "student B");

  const PAGE = `/fr/students/${amine}`;
  const call = (who, action, ...args) => callAction(baseUrl, { id: ids[action], path: PAGE, args, cookies: cookies[who] });
  const expect = async (name, promise, wanted, field) => {
    const r = await promise;
    const got = r.ok ? "ok" : r.error;
    check(label(name), got === wanted && (!field || r.field === field), `${got}${r.field ? ` (${r.field})` : ""}`);
    return r;
  };
  const page = async (who) => {
    const res = await fetch(new URL(PAGE, baseUrl), { headers: { cookie: cookies[who] }, redirect: "manual" });
    return { status: res.status, html: res.status === 200 ? await res.text() : "" };
  };
  const periods = async () => (await admin.from("student_services").select("*").eq("student_id", amine).order("from_month")).data ?? [];
  const discounts = async () => (await admin.from("student_discounts").select("*").eq("student_id", amine).order("kind")).data ?? [];

  try {
    // --- Page ----------------------------------------------------------------------------------------------
    const dirPage = await page("dirA");
    check(label("director: the Frais card shows the level's fee and Sara as a sibling"),
      dirPage.status === 200 && dirPage.html.includes("data-student-fees") && dirPage.html.includes("1 200,00 DH")
        && dirPage.html.includes("data-student-siblings") && dirPage.html.includes(`Sara`), String(dirPage.status));
    const accPage = await page("accA");
    check(label("accountant: the card shows, with the 'direction only' note for discounts"),
      accPage.status === 200 && accPage.html.includes("data-student-fees")
        && accPage.html.includes("Seule la direction peut accorder ou modifier une remise."), String(accPage.status));
    const survPage = await page("survA");
    check(label("surveillant (students.view, no fees.view): the student page opens without the card"),
      survPage.status === 200 && survPage.html.includes(`Amine`) && !survPage.html.includes("data-student-fees"), String(survPage.status));
    must(await admin.from("school_modules").update({ enabled: false }).eq("school_id", A.id).eq("module_key", "fees"), "A fees off");
    check(label("fees module off: no card for the director"), !(await page("dirA")).html.includes("data-student-fees"));
    await expect("fees module off: the accountant cannot add a service",
      call("accA", "addStudentService", amine, year, { serviceId: transport, fromMonth: "2080-09-01", toMonth: "" }), "forbidden");
    must(await admin.from("school_modules").update({ enabled: true }).eq("school_id", A.id).eq("module_key", "fees"), "A fees on");

    // --- Services ------------------------------------------------------------------------------------------
    const svc = (values) => ({ serviceId: transport, fromMonth: "2080-09-01", toMonth: "2080-12-01", ...values });
    await expect("surveillant cannot add a service", call("survA", "addStudentService", amine, year, svc({})), "forbidden");
    await expect("teacher cannot add a service", call("tchA", "addStudentService", amine, year, svc({})), "forbidden");
    await expect("an end before the start → toBeforeFrom",
      call("accA", "addStudentService", amine, year, svc({ fromMonth: "2080-12-01", toMonth: "2080-10-01" })), "toBeforeFrom", "toMonth");
    await expect("a month outside the year → monthOutsideYear",
      call("accA", "addStudentService", amine, year, svc({ fromMonth: "2080-08-01" })), "monthOutsideYear", "fromMonth");
    await expect("a student not enrolled this year → notEnrolled",
      call("accA", "addStudentService", nadia, year, svc({})), "notEnrolled");
    await expect("B's student → refused (notEnrolled: the trigger runs before the foreign key)", call("accA", "addStudentService", studentB, year, svc({})), "notEnrolled");
    const added = await expect("accountant adds Transport, September → December", call("accA", "addStudentService", amine, year, svc({})), "ok");
    await expect("an overlapping period → periodOverlap",
      call("accA", "addStudentService", amine, year, svc({ fromMonth: "2080-11-01", toMonth: "" })), "periodOverlap", "fromMonth");
    await expect("accountant adds a second period, March → end of year",
      call("accA", "addStudentService", amine, year, svc({ fromMonth: "2081-03-01", toMonth: "" })), "ok");
    let rows = await periods();
    check(label("…two periods stored (the second open-ended)"),
      rows.length === 2 && rows[0].to_month === "2080-12-01" && rows[1].to_month === null, JSON.stringify(rows.map((p) => [p.from_month, p.to_month])));
    await expect("accountant changes the first period to end in January",
      call("accA", "updateStudentService", added.data.id, svc({ toMonth: "2081-01-01" })), "ok");
    check(label("…stored"), (await periods())[0].to_month === "2081-01-01");
    await expect("stretching it over the second → periodOverlap",
      call("accA", "updateStudentService", added.data.id, svc({ toMonth: "2081-04-01" })), "periodOverlap", "fromMonth");
    await expect("director of B cannot change A's period",
      call("dirB", "updateStudentService", added.data.id, svc({})), "notFound");
    await expect("surveillant cannot remove a period", call("survA", "removeStudentService", rows[1].id), "forbidden");
    await expect("accountant removes the second period", call("accA", "removeStudentService", rows[1].id), "ok");
    check(label("…one period left"), (await periods()).length === 1);

    // --- Discounts: director only ----------------------------------------------------------------------------
    const disc = (values) => ({ kind: "sibling", mode: "percent", value: "10", appliesTo: "tuition", reason: "2e enfant", ...values });
    await expect("the accountant cannot add a discount", call("accA", "saveStudentDiscount", amine, year, disc({})), "forbidden");
    await expect("a surveillant cannot add a discount", call("survA", "saveStudentDiscount", amine, year, disc({})), "forbidden");
    await expect("150 % → percentRange", call("dirA", "saveStudentDiscount", amine, year, disc({ value: "150" })), "percentRange", "value");
    await expect("'abc' → percentRange", call("dirA", "saveStudentDiscount", amine, year, disc({ value: "abc" })), "percentRange", "value");
    await expect("a fixed amount of 0 → amountInvalid",
      call("dirA", "saveStudentDiscount", amine, year, disc({ kind: "fixed", value: "0" })), "amountInvalid", "value");
    await expect("not enrolled → notEnrolled", call("dirA", "saveStudentDiscount", nadia, year, disc({})), "notEnrolled");
    await expect("director adds a 10 % sibling discount", call("dirA", "saveStudentDiscount", amine, year, disc({})), "ok");
    await expect("the same kind again → discountKindTaken",
      call("dirA", "saveStudentDiscount", amine, year, disc({ value: "5" })), "discountKindTaken");
    await expect("director adds a fixed 100 DH discount (mode ignored for fixed)",
      call("dirA", "saveStudentDiscount", amine, year, disc({ kind: "fixed", mode: "percent", value: "100", appliesTo: "all", reason: "" })), "ok");
    await expect("director adds a 12,5 % scholarship as an amount of 250,50 DH",
      call("dirA", "saveStudentDiscount", amine, year, disc({ kind: "scholarship", mode: "amount", value: "250,50", reason: "" })), "ok");
    let list = await discounts();
    const byKind = Object.fromEntries(list.map((d) => [d.kind, d]));
    check(label("…stored: 1000 bp, 10 000 centimes, 25 050 centimes; empty reason = null"),
      byKind.sibling?.percent_bp === 1000 && byKind.fixed?.amount_centimes === 10000 && byKind.fixed.percent_bp === null
        && byKind.fixed.reason === null && byKind.scholarship?.amount_centimes === 25050,
      JSON.stringify(list.map((d) => [d.kind, d.percent_bp, d.amount_centimes, d.reason])));
    await expect("the accountant cannot change a discount",
      call("accA", "saveStudentDiscount", amine, year, disc({ value: "50" }), byKind.sibling.id), "forbidden");
    await expect("the accountant cannot delete a discount", call("accA", "deleteStudentDiscount", byKind.fixed.id), "forbidden");
    await expect("director changes the sibling discount to 15 %",
      call("dirA", "saveStudentDiscount", amine, year, disc({ value: "15", reason: "3e enfant" }), byKind.sibling.id), "ok");
    await expect("a discount id of another student → notFound",
      call("dirA", "saveStudentDiscount", sara, year, disc({ value: "20" }), byKind.sibling.id), "notFound");
    await expect("director of B cannot delete A's discount", call("dirB", "deleteStudentDiscount", byKind.fixed.id), "notFound");
    await expect("director deletes the fixed discount", call("dirA", "deleteStudentDiscount", byKind.fixed.id), "ok");
    list = await discounts();
    check(label("…sibling 15 %, fixed gone"),
      list.length === 2 && list.find((d) => d.kind === "sibling")?.percent_bp === 1500 && !list.some((d) => d.kind === "fixed"));
    const discPage = await page("dirA");
    // Amounts sit in left-to-right isolates (LRI … PDI): compared without them.
    check(label("page: the scholarship shows '250,50 DH par mois'"),
      discPage.html.replace(/[⁦⁩]/g, "").includes("250,50 DH par mois") && discPage.html.includes(`data-student-discount="scholarship"`));

    const logs = (await admin.from("audit_logs").select("action, actor_id").eq("school_id", A.id).eq("entity", "student_discount")
      // Only this suite's student: earlier suites log discounts in the same fixture school.
      .eq("data->>student_id", amine)
      .order("id")).data ?? [];
    check(label("audit: 3 creates, 1 edit, 1 delete, all by the director (trigger, no duplicate from the action)"),
      logs.map((l) => l.action).join() === "fee_discount.insert,fee_discount.insert,fee_discount.insert,fee_discount.update,fee_discount.delete"
        && logs.every((l) => l.actor_id === fx.users.dirA.id),
      logs.map((l) => l.action).join());
    const serviceLogs = ((await admin.from("audit_logs").select("action").eq("school_id", A.id)
      .like("action", "fees.student_service.%")).data ?? []).map((l) => l.action);
    check(label("audit: service add / update / remove"),
      ["fees.student_service.add", "fees.student_service.update", "fees.student_service.remove"].every((a) => serviceLogs.includes(a)),
      [...new Set(serviceLogs)].join(", "));
  } finally {
    await admin.from("student_guardians").delete().eq("guardian_id", guardian);
    await admin.from("guardians").delete().eq("id", guardian);
    await admin.from("student_enrollments").delete().eq("class_id", cls);
    await admin.from("students").delete().in("id", [amine, sara, nadia, studentB]);
    await admin.from("classes").delete().eq("id", cls);
    await admin.from("academic_years").update({ is_current: false }).eq("id", year);
    if (before) await admin.from("academic_years").update({ is_current: true }).eq("id", before.id);
    await admin.from("academic_years").delete().in("id", [year, yearB]);
    await admin.from("levels").delete().eq("id", level);
    await admin.from("school_modules").delete().in("school_id", [A.id, B.id]).eq("module_key", "fees");
  }
}
