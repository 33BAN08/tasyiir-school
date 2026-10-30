// Phase 13 step 2 Server Actions + page (/fees/settings): billed months + due
// day (save, reset), the plans grid, services (create, update, delete) and the
// copy from an earlier year, called over HTTP as real users on the page that
// registers them. Director and accountant (fees.manage) change; a surveillant
// (no fees permission) is sent home and refused; school B touches nothing of A.
import { randomBytes } from "node:crypto";

import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin } from "./fixtures.mjs";

const PAGE = "/fr/fees/settings";
const FILES = {
  saveFeeMonths: "src/lib/fees/settings-actions.ts",
  resetFeeMonths: "src/lib/fees/settings-actions.ts",
  saveFeePlans: "src/lib/fees/settings-actions.ts",
  createFeeService: "src/lib/fees/settings-actions.ts",
  updateFeeService: "src/lib/fees/settings-actions.ts",
  deleteFeeService: "src/lib/fees/settings-actions.ts",
  previewFeeCopy: "src/lib/fees/copy-actions.ts",
  copyFeesFromYear: "src/lib/fees/copy-actions.ts",
};

export async function feeSettingsActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const label = (s) => `[P13 settings action] ${s}`;
  const must = (r, what) => {
    if (r.error) throw new Error(`feeSettingsActions setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (q, what) => must(await q.select("id").single(), what).id;

  // --- Fixtures: fees module on for A and B, an accountant of A, years and levels -------------------------
  must(await admin.from("school_modules").insert([
    { school_id: A.id, module_key: "fees", enabled: true },
    { school_id: B.id, module_key: "fees", enabled: true },
  ]), "fees module");
  const email = `rls-test+${fx.run}-fsacc@example.com`;
  const password = `${randomBytes(12).toString("base64url")}a1`;
  const accUser = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), "accountant").user;
  fx.createdUserIds.push(accUser.id);
  must(await admin.from("profiles").insert({
    id: accUser.id, school_id: A.id, role_id: A.roles.accountant, full_name: "RLS fsacc", must_change_password: false,
  }), "accountant profile");

  const ids = Object.fromEntries(Object.entries(FILES).map(([name, file]) => [name, actionId(file, name)]));
  const cookies = { accA: await sessionCookies({ email, password }) };
  for (const name of ["dirA", "survA", "tchA", "dirB"]) cookies[name] = await sessionCookies(fx.users[name]);
  const call = (who, action, ...args) => callAction(baseUrl, { id: ids[action], path: PAGE, args, cookies: cookies[who] });
  const expect = async (name, promise, wanted, field) => {
    const r = await promise;
    const got = r.ok ? "ok" : r.error;
    check(label(name), got === wanted && (!field || r.field === field), `${got}${r.field ? ` (${r.field})` : ""}`);
    return r;
  };
  const page = async (who, query) => {
    const res = await fetch(new URL(`${PAGE}${query}`, baseUrl), { headers: { cookie: cookies[who] }, redirect: "manual" });
    const html = res.status === 200 ? await res.text() : "";
    const streamed = html.match(/NEXT_REDIRECT;\w+;([^;]+);/)?.[1];
    return { status: res.status, redirect: streamed ?? res.headers.get("location") ?? "", html: streamed ? "" : html };
  };

  const year = (school, start) => id(admin.from("academic_years").insert({
    school_id: school, label: `FS${start}-${fx.run}`, start_date: `${start}-09-01`, end_date: `${start + 1}-06-30`, is_current: false,
  }), `year ${start}`);
  const prev = await year(A.id, 2076);
  const cur = await year(A.id, 2077);
  const yearB = await year(B.id, 2077);
  const l1 = await id(admin.from("levels").insert({ school_id: A.id, cycle: "college", name: `FS 1AC ${fx.run}` }), "l1");
  const l2 = await id(admin.from("levels").insert({ school_id: A.id, cycle: "college", name: `FS 2AC ${fx.run}` }), "l2");
  const levelB = await id(admin.from("levels").insert({ school_id: B.id, cycle: "college", name: `FS B ${fx.run}` }), "level B");

  try {
    // --- Page access --------------------------------------------------------------------------------------
    const dirPage = await page("dirA", `?year=${cur}`);
    check(label("director: the page shows the year's months, September → June ticked by default"),
      dirPage.status === 200 && dirPage.html.includes(`data-month="2077-09-01"`)
        && /data-month="2078-06-01"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-month="2078-06-01"/.test(dirPage.html)
        && dirPage.html.includes(`data-fee-months-default="true"`),
      `${dirPage.status} ${dirPage.redirect}`);
    const accPage = await page("accA", `?year=${cur}&section=plans`);
    check(label("accountant: the plans section lists A's levels"),
      accPage.status === 200 && accPage.html.includes(`data-fee-level="${l1}"`), `${accPage.status} ${accPage.redirect}`);
    const survPage = await page("survA", "");
    check(label("surveillant (no fees.view): sent home"), survPage.redirect !== "" && !survPage.html.includes("data-month="),
      `${survPage.status} ${survPage.redirect}`);
    must(await admin.from("school_modules").update({ enabled: false }).eq("school_id", A.id).eq("module_key", "fees"), "A fees off");
    const offPage = await page("dirA", `?year=${cur}`);
    check(label("fees module off: the page says it is not in the plan"),
      offPage.status === 200 && offPage.html.includes("ne sont pas dans votre formule") && !offPage.html.includes("data-month="));
    await expect("fees module off: the director cannot save the months",
      call("dirA", "saveFeeMonths", cur, { months: ["2077-09-01"], dueDay: "5" }), "forbidden");
    must(await admin.from("school_modules").update({ enabled: true }).eq("school_id", A.id).eq("module_key", "fees"), "A fees on");

    // --- Months -------------------------------------------------------------------------------------------
    const months = ["2078-06-01", "2077-09-01", "2077-10-01"];
    await expect("surveillant cannot save the months", call("survA", "saveFeeMonths", cur, { months, dueDay: "5" }), "forbidden");
    await expect("teacher cannot save the months", call("tchA", "saveFeeMonths", cur, { months, dueDay: "5" }), "forbidden");
    await expect("a month not on the 1st → monthInvalid",
      call("accA", "saveFeeMonths", cur, { months: ["2077-09-15"], dueDay: "5" }), "monthInvalid", "months");
    await expect("no month → monthsRequired", call("accA", "saveFeeMonths", cur, { months: [], dueDay: "5" }), "monthsRequired", "months");
    await expect("a month outside the year → monthsInvalid",
      call("accA", "saveFeeMonths", cur, { months: ["2078-08-01"], dueDay: "5" }), "monthsInvalid");
    await expect("due day 29 → dueDayRange", call("accA", "saveFeeMonths", cur, { months, dueDay: "29" }), "dueDayRange", "dueDay");
    await expect("accountant saves 3 months, due on the 10th", call("accA", "saveFeeMonths", cur, { months, dueDay: "10" }), "ok");
    const saved = (await admin.from("fee_years").select("*").eq("academic_year_id", cur).single()).data;
    check(label("…stored sorted, day 10, who recorded"),
      saved?.billing_months.join() === "2077-09-01,2077-10-01,2078-06-01" && saved.due_day === 10 && saved.updated_by === accUser.id,
      JSON.stringify(saved));
    await expect("accountant saves again (update path)", call("accA", "saveFeeMonths", cur, { months, dueDay: "12" }), "ok");
    check(label("…the same row changed"),
      (await admin.from("fee_years").select("due_day").eq("academic_year_id", cur).single()).data?.due_day === 12);
    await expect("director of B cannot save months on A's year",
      call("dirB", "saveFeeMonths", cur, { months: ["2077-09-01"], dueDay: "5" }), "notFound");
    await expect("director resets to the defaults", call("dirA", "resetFeeMonths", cur), "ok");
    check(label("…the row is gone"),
      ((await admin.from("fee_years").select("academic_year_id").eq("academic_year_id", cur)).data ?? []).length === 0);
    await expect("surveillant cannot reset", call("survA", "resetFeeMonths", cur), "forbidden");

    // --- Plans grid ---------------------------------------------------------------------------------------
    const plansOf = async (y) => (await admin.from("fee_plans").select("*").eq("academic_year_id", y)).data ?? [];
    await expect("surveillant cannot save plans",
      call("survA", "saveFeePlans", cur, [{ levelId: l1, registration: "1500", monthly: "1200" }]), "forbidden");
    const bad = await call("accA", "saveFeePlans", cur, [
      { levelId: l1, registration: "1500", monthly: "1200" },
      { levelId: l2, registration: "abc", monthly: "" },
    ]);
    check(label("an amount 'abc' → amountInvalid, pointing at the level"),
      !bad.ok && bad.error === "amountInvalid" && bad.level === l2, JSON.stringify(bad));
    check(label("…nothing saved"), (await plansOf(cur)).length === 0);
    await expect("an amount over 100 000 DH → amountInvalid",
      call("accA", "saveFeePlans", cur, [{ levelId: l1, registration: "", monthly: "100000,01" }]), "amountInvalid");
    await expect("accountant saves 1AC (1 500 + 1 200,50) and 2AC (monthly only)", call("accA", "saveFeePlans", cur, [
      { levelId: l1, registration: "1 500", monthly: "1200,5" },
      { levelId: l2, registration: "", monthly: "1300" },
    ]), "ok");
    let plans = await plansOf(cur);
    const p1 = plans.find((p) => p.level_id === l1);
    const p2 = plans.find((p) => p.level_id === l2);
    check(label("…stored in centimes (empty registration = 0)"),
      p1?.registration_centimes === 150000 && p1.monthly_centimes === 120050
        && p2?.registration_centimes === 0 && p2.monthly_centimes === 130000,
      JSON.stringify(plans.map((p) => [p.registration_centimes, p.monthly_centimes])));
    await expect("director changes 1AC and clears 2AC", call("dirA", "saveFeePlans", cur, [
      { levelId: l1, registration: "1500", monthly: "1250" },
      { levelId: l2, registration: "", monthly: "" },
    ]), "ok");
    plans = await plansOf(cur);
    check(label("…1AC updated in place, 2AC removed"),
      plans.length === 1 && plans[0].id === p1.id && plans[0].monthly_centimes === 125000, JSON.stringify(plans));
    await expect("a grid with a good row and B's level → notFound", call("dirA", "saveFeePlans", cur, [
      { levelId: l1, registration: "1500", monthly: "9999" },
      { levelId: levelB, registration: "", monthly: "100" },
    ]), "notFound");
    check(label("…all or nothing: 1AC still 1 250 DH"),
      (await plansOf(cur)).find((p) => p.level_id === l1)?.monthly_centimes === 125000);
    await expect("B's level in A's grid → notFound",
      call("dirA", "saveFeePlans", cur, [{ levelId: levelB, registration: "", monthly: "100" }]), "notFound");
    await expect("director of B cannot write plans into A's year",
      call("dirB", "saveFeePlans", cur, [{ levelId: l2, registration: "", monthly: "100" }]), "notFound");
    const page2 = await page("dirA", `?year=${cur}&section=plans`);
    check(label("page: 1AC's year total = 1 500 + 10 × 1 250 = 14 000,00 DH"),
      page2.html.includes("14 000,00 DH"), page2.status);

    // --- Services -----------------------------------------------------------------------------------------
    const service = { name: "Transport", nameAr: "النقل", monthly: "400", active: true };
    await expect("surveillant cannot create a service", call("survA", "createFeeService", cur, service), "forbidden");
    await expect("empty name → nameRequired", call("accA", "createFeeService", cur, { ...service, name: " " }), "nameRequired", "name");
    await expect("no price → amountRequired", call("accA", "createFeeService", cur, { ...service, monthly: "" }), "amountRequired", "monthly");
    const created = await expect("accountant creates Transport 400 DH", call("accA", "createFeeService", cur, service), "ok");
    const transport = created.data?.id;
    await expect("the same name again → serviceNameTaken",
      call("accA", "createFeeService", cur, { ...service, monthly: "1" }), "serviceNameTaken", "name");
    const cantine = (await call("accA", "createFeeService", cur, { name: "Cantine", nameAr: "", monthly: "350", active: true })).data?.id;
    await expect("accountant changes Transport to 450 and deactivates it",
      call("accA", "updateFeeService", transport, { ...service, monthly: "450", active: false }), "ok");
    const t1 = (await admin.from("fee_services").select("*").eq("id", transport).single()).data;
    check(label("…stored 45 000 centimes, inactive, Arabic name kept"),
      t1?.monthly_centimes === 45000 && t1.active === false && t1.name_ar === "النقل", JSON.stringify(t1));
    await expect("director of B cannot change A's service", call("dirB", "updateFeeService", transport, service), "notFound");
    // A student on Transport: the service can no longer be deleted.
    const cls = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: cur, level_id: l1, name: `FS-A ${fx.run}` }), "class");
    const kid = await id(admin.from("students").insert({
      school_id: A.id, first_name: "Kid", last_name: `FS ${fx.run}`, birth_date: "2014-01-01", gender: "male" }), "kid");
    must(await admin.from("student_enrollments").insert({ school_id: A.id, student_id: kid, academic_year_id: cur, class_id: cls }), "enroll");
    must(await admin.from("student_services").insert({
      school_id: A.id, academic_year_id: cur, student_id: kid, service_id: transport, from_month: "2077-09-01" }), "period");
    await expect("a service a student uses → serviceInUse", call("accA", "deleteFeeService", transport), "serviceInUse");
    const svcPage = await page("accA", `?year=${cur}&section=services`);
    check(label("page: Transport shows 1 élève and Inactif"),
      svcPage.html.includes(`data-fee-service="${transport}"`) && svcPage.html.includes("1 élève") && svcPage.html.includes("Inactif"));
    await expect("surveillant cannot delete a service", call("survA", "deleteFeeService", cantine), "forbidden");
    await expect("accountant deletes Cantine (unused)", call("accA", "deleteFeeService", cantine), "ok");

    // --- Copy from an earlier year -------------------------------------------------------------------------
    must(await admin.from("fee_plans").insert([
      { school_id: A.id, academic_year_id: prev, level_id: l1, registration_centimes: 100000, monthly_centimes: 100000 },
      { school_id: A.id, academic_year_id: prev, level_id: l2, registration_centimes: 110000, monthly_centimes: 110000 },
    ]), "previous plans");
    must(await admin.from("fee_services").insert([
      { school_id: A.id, academic_year_id: prev, name: "Transport", name_ar: null, monthly_centimes: 30000, active: true },
      { school_id: A.id, academic_year_id: prev, name: "Garderie", name_ar: "الحضانة", monthly_centimes: 20000, active: false },
    ]), "previous services");
    await expect("surveillant cannot preview a copy", call("survA", "previewFeeCopy", prev, cur), "forbidden");
    await expect("a later year as the source → sourceNotEarlier", call("dirA", "previewFeeCopy", cur, prev), "sourceNotEarlier");
    await expect("B's year as the source → notFound", call("dirA", "previewFeeCopy", yearB, cur), "notFound");
    const preview = await call("accA", "previewFeeCopy", prev, cur);
    const status = (r) => (r.data ?? []).map((l) => `${l.kind}:${l.kind === "plan" ? (l.key === l1 ? "1AC" : "2AC") : l.key}:${l.status}`).sort().join();
    check(label("preview: 1AC and Transport kept, 2AC and Garderie to copy"),
      status(preview) === "plan:1AC:exists,plan:2AC:copy,service:Garderie:copy,service:Transport:exists", status(preview));
    check(label("…the preview writes nothing"), (await plansOf(cur)).length === 1);
    await expect("accountant copies", call("accA", "copyFeesFromYear", prev, cur), "ok");
    plans = await plansOf(cur);
    const garderie = (await admin.from("fee_services").select("*").eq("academic_year_id", cur).eq("name", "Garderie").maybeSingle()).data;
    check(label("…2AC copied, 1AC untouched, Garderie copied with its Arabic name and inactive"),
      plans.length === 2 && plans.find((p) => p.level_id === l1)?.monthly_centimes === 125000
        && plans.find((p) => p.level_id === l2)?.monthly_centimes === 110000
        && garderie?.name_ar === "الحضانة" && garderie.active === false,
      JSON.stringify([plans.map((p) => p.monthly_centimes), garderie]));
    const again = await call("accA", "previewFeeCopy", prev, cur);
    check(label("a second preview: everything already set"), (again.data ?? []).every((l) => l.status === "exists"), status(again));

    // --- Audit ----------------------------------------------------------------------------------------------
    const actions = ((await admin.from("audit_logs").select("action").eq("school_id", A.id).like("action", "fees.%")).data ?? [])
      .map((a) => a.action);
    const has = (a) => actions.includes(a);
    check(label("audit: months save / reset, plans, services create / update / delete, copy"),
      ["fees.months.save", "fees.months.reset", "fees.plans.save", "fees.service.create", "fees.service.update",
        "fees.service.delete", "fees.copy.year"].every(has), [...new Set(actions)].join(", "));

    // Cleanup of the student bits (the years take the rest).
    await admin.from("student_enrollments").delete().eq("student_id", kid);
    await admin.from("students").delete().eq("id", kid);
    await admin.from("classes").delete().eq("id", cls);
  } finally {
    await admin.from("academic_years").delete().in("id", [prev, cur, yearB]);
    await admin.from("levels").delete().in("id", [l1, l2, levelB]);
    await admin.from("school_modules").delete().in("school_id", [A.id, B.id]).eq("module_key", "fees");
  }
}
