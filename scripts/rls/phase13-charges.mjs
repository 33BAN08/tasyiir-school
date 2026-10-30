// Phase 13 step 3: charges. student_charges follow the fee setup by themselves
// (triggers): plans (save_fee_plans, all levels or nothing), billed months,
// services and their price, discounts (percents add up, rounded to the whole
// dirham, then fixed amounts, never above the price), a student's billed range
// (arrives mid-year / leaves), class changes and the end of an enrollment.
// Cancelled charges (cancel_charge, fees.cancel) are never changed nor
// recreated. Reads: fees.view; nobody writes the table directly.
// (A charge WITH money on it is checked in step 4, when payments exist.)
import { randomBytes } from "node:crypto";

import { check, denied, rows } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";

export async function phase13Charges({ fx, as }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const label = (s) => `[P13 charges] ${s}`;
  const must = (r, what) => {
    if (r.error) throw new Error(`phase13Charges setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (q, what) => must(await q.select("id").single(), what).id;
  const refused = (name, error, expected) =>
    check(label(`refused: ${name}`), !!error && (error.message === expected || error.code === expected),
      error ? `${error.code} ${error.message}` : "accepted!");

  // --- Fixtures -------------------------------------------------------------------------------------------
  must(await admin.from("school_modules").insert([
    { school_id: A.id, module_key: "fees", enabled: true },
    { school_id: B.id, module_key: "fees", enabled: true },
  ]), "fees module");
  const account = async (key, role) => {
    const email = `rls-test+${fx.run}-p13c${key}@example.com`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), key).user;
    fx.createdUserIds.push(user.id);
    must(await admin.from("profiles").insert({
      id: user.id, school_id: A.id, role_id: A.roles[role], full_name: `RLS p13c${key}`, must_change_password: false,
    }), `${key} profile`);
    return signIn({ email, password });
  };
  const accA = await account("acc", "accountant");
  const parA = await account("par", "parent");
  const stuA = await account("stu", "student");

  const year = await id(admin.from("academic_years").insert({
    school_id: A.id, label: `P13C-${fx.run}`, start_date: "2090-09-01", end_date: "2091-06-30", is_current: false,
  }), "year");
  const yearB = await id(admin.from("academic_years").insert({
    school_id: B.id, label: `P13C-${fx.run}`, start_date: "2090-09-01", end_date: "2091-06-30", is_current: false,
  }), "year B");
  const level = (school, name) => id(admin.from("levels").insert({ school_id: school, cycle: "college", name: `${name} ${fx.run}` }), name);
  const L1 = await level(A.id, "C1AC");
  const L2 = await level(A.id, "C2AC");
  const L3 = await level(A.id, "C3AC");
  const LB = await level(B.id, "CB");
  const klass = (school, y, l, name) => id(admin.from("classes").insert({ school_id: school, academic_year_id: y, level_id: l, name: `${name} ${fx.run}` }), name);
  const c1 = await klass(A.id, year, L1, "C1");
  const c2 = await klass(A.id, year, L2, "C2");
  const c3 = await klass(A.id, year, L3, "C3");
  const cB = await klass(B.id, yearB, LB, "CB");
  const student = (school, name) => id(admin.from("students").insert({
    school_id: school, first_name: name, last_name: `P13C ${fx.run}`, birth_date: "2014-01-01", gender: "male" }), name);
  const s1 = await student(A.id, "Adam");     // the reference student (1AC, whole year)
  const s2 = await student(A.id, "Badr");     // arrives in November
  const s3 = await student(A.id, "Chama");    // leaves after February, then the enrollment ends
  const s4 = await student(A.id, "Dina");     // discounts (3AC)
  const s5 = await student(A.id, "Elias");    // class change 1AC → 2AC
  const sB = await student(B.id, "Omar");
  const enroll = (school, s, y, c) => admin.from("student_enrollments").insert({ school_id: school, student_id: s, academic_year_id: y, class_id: c });
  must(await enroll(A.id, s1, year, c1), "enroll s1");
  must(await enroll(A.id, s3, year, c1), "enroll s3");
  must(await enroll(A.id, s4, year, c3), "enroll s4");
  must(await enroll(A.id, s5, year, c1), "enroll s5");
  must(await enroll(B.id, sB, yearB, cB), "enroll sB");

  const charges = async (s) => (await admin.from("student_charges").select("*").eq("student_id", s)
    .order("kind").order("month", { nullsFirst: true })).data ?? [];
  const tuition = (list) => list.filter((c) => c.kind === "tuition");
  const months = (list) => list.map((c) => c.month).join();
  const ALL = ["2090-09-01", "2090-10-01", "2090-11-01", "2090-12-01", "2091-01-01", "2091-02-01",
    "2091-03-01", "2091-04-01", "2091-05-01", "2091-06-01"];
  const save = (client, y, list) => client.rpc("save_fee_plans", { p_year: y, p_rows: list });

  try {
    // --- save_fee_plans: who --------------------------------------------------------------------------------
    const plans = [
      { level_id: L1, registration_centimes: 150000, monthly_centimes: 120000 },
      { level_id: L2, registration_centimes: null, monthly_centimes: 100000 },
    ];
    for (const [who, client, expected] of [["a surveillant", as.survA, "fees_forbidden"], ["a teacher", as.tchA, "fees_forbidden"],
      ["a parent", parA, "fees_forbidden"], ["a student", stuA, "fees_forbidden"], ["suspended school C's director", as.dirC, "fees_forbidden"],
      ["the platform owner", as.owner, "fees_forbidden"], ["the director of B (A's year)", as.dirB, "fees_year_not_found"]]) {
      refused(`save_fee_plans by ${who}`, (await save(client, year, plans)).error, expected);
    }
    const { error: anonSave } = await save(as.anon, year, plans);
    check(label("save_fee_plans signed out: refused"), !!anonSave, anonSave?.code ?? "accepted!");
    const { data: savedCount, error: saveError } = await save(accA, year, plans);
    check(label("the accountant saves 1AC (1 500 + 1 200 / month) and 2AC (1 000 / month)"),
      !saveError && savedCount === 2, saveError?.message ?? String(savedCount));

    // --- The charges that follow --------------------------------------------------------------------------
    let list = await charges(s1);
    const reg = list.find((c) => c.kind === "registration");
    check(label("Adam: registration 1 500 DH due on 5 September + 10 monthly fees of 1 200 DH, due on the 5th"),
      reg?.gross_centimes === 150000 && reg.month === null && reg.due_on === "2090-09-05"
        && months(tuition(list)) === ALL.join() && tuition(list).every((c) => c.gross_centimes === 120000 && c.net_centimes === 120000
          && c.due_on === `${c.month.slice(0, 8)}05`),
      JSON.stringify(list.map((c) => [c.kind, c.month, c.gross_centimes, c.due_on])));

    // --- All levels or nothing ------------------------------------------------------------------------------
    const before = JSON.stringify(await charges(s1));
    refused("a grid with B's level in it (nothing saved)",
      (await save(as.dirA, year, [{ level_id: L1, registration_centimes: 150000, monthly_centimes: 130000 },
        { level_id: LB, registration_centimes: null, monthly_centimes: 100 }])).error, "23503");
    refused("a grid with a negative amount (nothing saved)",
      (await save(as.dirA, year, [{ level_id: L1, registration_centimes: 150000, monthly_centimes: 130000 },
        { level_id: L2, registration_centimes: null, monthly_centimes: -1 }])).error, "23514");
    for (const [name, value] of [["the same level twice", [{ level_id: L1, monthly_centimes: 1 }, { level_id: L1, monthly_centimes: 2 }]],
      ["an amount 'abc'", [{ level_id: L1, monthly_centimes: "abc" }]], ["a level id 'x'", [{ level_id: "x", monthly_centimes: 1 }]],
      ["a row without level", [{ monthly_centimes: 1 }]], ["not a list", { level_id: L1 }]]) {
      refused(`save_fee_plans: ${name}`, (await save(as.dirA, year, value)).error, "fees_rows_invalid");
    }
    const plansNow = (await admin.from("fee_plans").select("level_id, monthly_centimes").eq("academic_year_id", year)).data ?? [];
    check(label("…after the refusals: 1AC still 1 200 DH, 2AC still there, Adam's charges unchanged"),
      plansNow.find((p) => p.level_id === L1)?.monthly_centimes === 120000 && plansNow.some((p) => p.level_id === L2)
        && JSON.stringify(await charges(s1)) === before, JSON.stringify(plansNow));

    // --- Arrives mid-year: registration + only from the arrival month ------------------------------------
    must(await enroll(A.id, s2, year, c1), "enroll s2");
    const { error: rangeError } = await accA.from("student_fee_ranges")
      .insert({ school_id: A.id, academic_year_id: year, student_id: s2, from_month: "2090-11-01" }).select("student_id");
    check(label("the accountant sets Badr's first billed month: November"), !rangeError, rangeError?.message ?? "");
    list = await charges(s2);
    check(label("Badr (arrives in November): registration due 5 November + monthly fees November → June only"),
      list.find((c) => c.kind === "registration")?.due_on === "2090-11-05" && months(tuition(list)) === ALL.slice(2).join()
        && list.length === 9, JSON.stringify(list.map((c) => [c.kind, c.month])));
    refused("a range month outside the year",
      (await accA.from("student_fee_ranges").update({ from_month: "2090-08-01" }).eq("student_id", s2).select("student_id")).error,
      "fees_month_outside_year");
    refused("a range for a student not enrolled in A this year (B's student)",
      (await accA.from("student_fee_ranges").insert({ school_id: A.id, academic_year_id: year, student_id: sB, from_month: "2090-11-01" })
        .select("student_id")).error, "fees_student_not_enrolled");
    await denied(label("a surveillant cannot set a range"),
      as.survA.from("student_fee_ranges").update({ from_month: "2090-10-01" }).eq("student_id", s2).select("student_id"));

    // --- Leaves: nothing after the last month; enrollment ended: nothing at all, and nothing new -----------
    must(await accA.from("student_fee_ranges").insert({ school_id: A.id, academic_year_id: year, student_id: s3, to_month: "2091-02-01" })
      .select("student_id"), "range s3");
    check(label("Chama (leaves after February): monthly fees September → February only"),
      months(tuition(await charges(s3))) === ALL.slice(0, 6).join(), months(tuition(await charges(s3))));
    must(await admin.from("student_enrollments").delete().eq("student_id", s3).eq("academic_year_id", year), "end s3");
    check(label("Chama's enrollment ended: her unpaid charges are gone"), (await charges(s3)).length === 0,
      `${(await charges(s3)).length} charge(s)`);
    must(await save(as.dirA, year, [{ level_id: L1, registration_centimes: 160000, monthly_centimes: 120000 }]), "registration 1 600");
    const { data: s3Refresh } = await accA.rpc("refresh_student_charges", { p_student: s3, p_year: year });
    check(label("…a plan change and a refresh later: still no charge for her"),
      (await charges(s3)).length === 0 && s3Refresh?.[0]?.inserted === 0, JSON.stringify(s3Refresh));
    check(label("…while Adam's unpaid registration followed the plan: 1 600 DH"),
      (await charges(s1)).find((c) => c.kind === "registration")?.gross_centimes === 160000);

    // --- Discounts: percents add up, whole dirham (half up), then fixed, never above the price ------------
    must(await save(as.dirA, year, [{ level_id: L3, registration_centimes: 100000, monthly_centimes: 123456 }]), "3AC plan");
    must(await as.dirA.from("student_discounts").insert([
      { school_id: A.id, academic_year_id: year, student_id: s4, kind: "sibling", percent_bp: 1000, applies_to: "tuition" },
      { school_id: A.id, academic_year_id: year, student_id: s4, kind: "scholarship", percent_bp: 2500, applies_to: "tuition" },
      { school_id: A.id, academic_year_id: year, student_id: s4, kind: "fixed", amount_centimes: 5000, applies_to: "all" },
    ]).select("id"), "discounts s4");
    list = await charges(s4);
    // 1 234,56 DH × 35 % = 432,096 DH → 432 DH; + 50 DH fixed = 482 DH.
    check(label("Dina's monthly fee: 1 234,56 DH − (35 % rounded to 432 DH + 50 DH) = 752,56 DH"),
      tuition(list).every((c) => c.gross_centimes === 123456 && c.discount_centimes === 48200 && c.net_centimes === 75256),
      JSON.stringify(tuition(list).slice(0, 1)));
    check(label("…her registration only gets the fixed 50 DH (the percents are on monthly fees)"),
      list.find((c) => c.kind === "registration")?.discount_centimes === 5000);
    must(await as.dirA.from("student_discounts").update({ percent_bp: 9500 }).eq("student_id", s4).eq("kind", "scholarship").select("id"), "95 %");
    check(label("10 % + 95 % → capped at 100 %: the monthly fee is free (discount = price, never more)"),
      tuition(await charges(s4)).every((c) => c.discount_centimes === 123456 && c.net_centimes === 0));
    must(await as.dirA.from("student_discounts").update({ percent_bp: 2500 }).eq("student_id", s4).eq("kind", "scholarship").select("id"), "back to 25 %");
    const transport = await id(admin.from("fee_services").insert({
      school_id: A.id, academic_year_id: year, name: "Transport", monthly_centimes: 10100 }), "transport");
    must(await accA.from("student_services").insert({
      school_id: A.id, academic_year_id: year, student_id: s4, service_id: transport, from_month: "2090-10-01", to_month: "2090-12-01",
    }).select("id"), "s4 transport");
    must(await as.dirA.from("student_discounts").update({ applies_to: "services", amount_centimes: null, percent_bp: 5000 })
      .eq("student_id", s4).eq("kind", "scholarship").select("id"), "scholarship on services");
    list = await charges(s4);
    // 101 DH × 50 % = 50,5 DH → 51 DH (half up), + 50 DH fixed = 101 DH = the price.
    const svc = list.filter((c) => c.kind === "service");
    check(label("Transport 101 DH × 50 % = 50,5 → 51 DH (half up) + 50 DH fixed → capped at 101 DH; October → December only"),
      months(svc) === "2090-10-01,2090-11-01,2090-12-01" && svc.every((c) => c.discount_centimes === 10100 && c.net_centimes === 0),
      JSON.stringify(svc.map((c) => [c.month, c.gross_centimes, c.discount_centimes])));
    must(await as.dirA.from("student_discounts").delete().eq("student_id", s4).eq("kind", "fixed").select("id"), "drop fixed");
    check(label("…without the fixed amount: 51 DH off, 50 DH left to pay"),
      (await charges(s4)).filter((c) => c.kind === "service").every((c) => c.discount_centimes === 5100 && c.net_centimes === 5000));

    // --- Services: price change, period removed ------------------------------------------------------------
    must(await accA.from("fee_services").update({ monthly_centimes: 12000 }).eq("id", transport).select("id"), "price 120");
    check(label("a new service price reaches the unpaid service charges"),
      (await charges(s4)).filter((c) => c.kind === "service").every((c) => c.gross_centimes === 12000));
    must(await accA.from("student_services").delete().eq("student_id", s4).select("id"), "remove period");
    check(label("the service period removed: its charges are gone"), !(await charges(s4)).some((c) => c.kind === "service"));

    // --- Class change and billed months ------------------------------------------------------------------
    must(await admin.from("student_enrollments").update({ class_id: c2 }).eq("student_id", s5).eq("academic_year_id", year), "move s5");
    list = await charges(s5);
    check(label("Elias moved 1AC → 2AC: no registration (2AC has none), monthly fees 1 000 DH"),
      !list.some((c) => c.kind === "registration") && tuition(list).length === 10 && tuition(list).every((c) => c.gross_centimes === 100000),
      JSON.stringify(list.map((c) => [c.kind, c.gross_centimes])));
    must(await accA.from("fee_years").insert({
      school_id: A.id, academic_year_id: year, billing_months: ["2090-09-01", "2090-10-01", "2090-11-01", "2090-12-01"], due_day: 10,
    }).select("academic_year_id"), "4 months");
    list = await charges(s1);
    check(label("billed months cut to September → December, due on the 10th: Adam has 4 monthly fees, registration due 10 September"),
      months(tuition(list)) === ALL.slice(0, 4).join() && tuition(list).every((c) => c.due_on.endsWith("-10"))
        && list.find((c) => c.kind === "registration")?.due_on === "2090-09-10", months(tuition(list)));
    must(await accA.from("fee_years").delete().eq("academic_year_id", year).select("academic_year_id"), "months back");
    check(label("…back to the defaults: 10 monthly fees again"), tuition(await charges(s1)).length === 10);

    // --- cancel_charge ------------------------------------------------------------------------------------
    const sept = tuition(await charges(s1))[0];
    refused("the accountant cannot cancel a charge (fees.cancel)",
      (await accA.rpc("cancel_charge", { p_charge: sept.id, p_reason: "waived" })).error, "fees_forbidden");
    refused("an unknown reason", (await as.dirA.rpc("cancel_charge", { p_charge: sept.id, p_reason: "nope" })).error, "fees_cancel_reason_invalid");
    refused("'other' without a note", (await as.dirA.rpc("cancel_charge", { p_charge: sept.id, p_reason: "other", p_note: "  " })).error,
      "fees_cancel_note_required");
    refused("the director of B cancels A's charge",
      (await as.dirB.rpc("cancel_charge", { p_charge: sept.id, p_reason: "waived" })).error, "fees_charge_not_found");
    const { error: cancelError } = await as.dirA.rpc("cancel_charge", { p_charge: sept.id, p_reason: "waived", p_note: "Rentrée offerte" });
    const cancelled = (await admin.from("student_charges").select("*").eq("id", sept.id).single()).data;
    check(label("the director cancels Adam's September fee (who, when, reason, note)"),
      !cancelError && cancelled?.cancel_reason === "waived" && cancelled.cancel_note === "Rentrée offerte"
        && cancelled.cancelled_by === fx.users.dirA.id && cancelled.cancelled_at !== null, cancelError?.message ?? "");
    refused("cancelling it twice", (await as.dirA.rpc("cancel_charge", { p_charge: sept.id, p_reason: "waived" })).error, "fees_charge_cancelled");
    const audit = (await admin.from("audit_logs").select("action, actor_id, data").eq("entity_id", sept.id)).data ?? [];
    check(label("…logged: fee_charge.cancel by the director, with the reason"),
      audit.length === 1 && audit[0].action === "fee_charge.cancel" && audit[0].actor_id === fx.users.dirA.id && audit[0].data.reason === "waived");
    must(await save(as.dirA, year, [{ level_id: L1, registration_centimes: 160000, monthly_centimes: 125000 }]), "1AC 1 250");
    const { data: refreshAll } = await accA.rpc("refresh_year_charges", { p_year: year });
    list = await charges(s1);
    const septAfter = list.filter((c) => c.kind === "tuition" && c.month === "2090-09-01");
    check(label("after a price change + refresh: the cancelled September fee is unchanged and not recreated"),
      septAfter.length === 1 && septAfter[0].cancelled_at !== null && septAfter[0].gross_centimes === 120000
        && tuition(list).filter((c) => !c.cancelled_at).every((c) => c.gross_centimes === 125000),
      JSON.stringify([septAfter.map((c) => c.gross_centimes), refreshAll]));
    check(label("a second refresh of the year changes nothing"),
      JSON.stringify((await accA.rpc("refresh_year_charges", { p_year: year })).data) === JSON.stringify([{ inserted: 0, updated: 0, removed: 0, kept: 0 }]));
    const { error: delService } = await admin.from("fee_services").delete().eq("id", transport);
    check(label("a service is deleted only once it has no charges (its periods are gone: allowed)"), !delService, delService?.message ?? "");

    // --- Refresh RPCs: who --------------------------------------------------------------------------------
    refused("refresh_year_charges by a surveillant", (await as.survA.rpc("refresh_year_charges", { p_year: year })).error, "fees_forbidden");
    refused("refresh_student_charges on B's student", (await accA.rpc("refresh_student_charges", { p_student: sB, p_year: year })).error,
      "fees_student_not_found");
    refused("refresh_year_charges on B's year", (await accA.rpc("refresh_year_charges", { p_year: yearB })).error, "fees_year_not_found");

    // --- Two refreshes at once: no duplicate, no error -----------------------------------------------------
    const countBefore = (await charges(s1)).length;
    const parallel = await Promise.all([1, 2, 3, 4, 5].map(() => accA.rpc("refresh_student_charges", { p_student: s1, p_year: year })));
    const parallelSaves = await Promise.all([125000, 126000, 125000].map((m) =>
      save(as.dirA, year, [{ level_id: L1, registration_centimes: 160000, monthly_centimes: m }])));
    list = await charges(s1);
    const keys = new Set(list.map((c) => `${c.kind}|${c.service_id}|${c.month}`));
    check(label("5 refreshes + 3 grid saves at once: no error, no duplicate charge"),
      parallel.every((r) => !r.error) && parallelSaves.every((r) => !r.error) && list.length === countBefore && keys.size === list.length,
      `${list.length} vs ${countBefore}; ${[...parallel, ...parallelSaves].map((r) => r.error?.message).filter(Boolean).join(", ")}`);

    // --- Reads + no direct writes ---------------------------------------------------------------------------
    await rows(label("the director reads A's charges only"), as.dirA.from("student_charges").select("school_id"),
      (l) => l.length > 0 && l.every((c) => c.school_id === A.id));
    await rows(label("the accountant reads A's charges"), accA.from("student_charges").select("school_id").eq("student_id", s1), (l) => l.length > 0);
    for (const [who, client] of [["a surveillant", as.survA], ["a teacher", as.tchA], ["a parent", parA], ["a student", stuA],
      ["suspended school C's director", as.dirC], ["the platform owner", as.owner]]) {
      await rows(label(`${who} reads no charge`), client.from("student_charges").select("id"), 0);
    }
    await rows(label("the director of B reads none of A's charges"), as.dirB.from("student_charges").select("id").eq("school_id", A.id), 0);
    const { data: anonRows, error: anonError } = await as.anon.from("student_charges").select("id");
    check(label("signed out: no charge (no grant)"), anonError?.code === "42501" || anonRows?.length === 0, anonError?.code ?? "");
    await denied(label("the director cannot insert a charge directly"), as.dirA.from("student_charges").insert({
      school_id: A.id, academic_year_id: year, student_id: s1, kind: "tuition", month: "2091-07-01", gross_centimes: 1, due_on: "2091-07-05",
    }).select("id"));
    await denied(label("the director cannot change a charge directly"),
      as.dirA.from("student_charges").update({ gross_centimes: 1 }).eq("student_id", s1).select("id"));
    await denied(label("the director cannot delete a charge directly"),
      as.dirA.from("student_charges").delete().eq("student_id", s1).select("id"));
    await rows(label("the accountant reads the billed ranges (Badr, Chama)"), accA.from("student_fee_ranges").select("student_id"), (l) => l.length === 2);
    await rows(label("a surveillant reads no billed range"), as.survA.from("student_fee_ranges").select("student_id"), 0);

    // --- Module off ---------------------------------------------------------------------------------------
    must(await admin.from("school_modules").update({ enabled: false }).eq("school_id", A.id).eq("module_key", "fees"), "A fees off");
    refused("fees module off: save_fee_plans", (await save(as.dirA, year, plans)).error, "fees_forbidden");
    await rows(label("fees module off: the director reads no charge"), as.dirA.from("student_charges").select("id"), 0);
    must(await admin.from("school_modules").update({ enabled: true }).eq("school_id", A.id).eq("module_key", "fees"), "A fees on");

    // --- A school with charges can still be deleted (the refresh stays out of the cascade) ------------------
    const temp = must(await admin.from("schools").insert({ name: `P13C temp ${fx.run}`, slug: `rls-test-p13c-${fx.run}` }).select("id").single(), "temp school");
    const tYear = await id(admin.from("academic_years").insert({ school_id: temp.id, label: "T", start_date: "2090-09-01", end_date: "2091-06-30" }), "t year");
    const tLevel = await level(temp.id, "TL");
    const tClass = await klass(temp.id, tYear, tLevel, "TC");
    must(await admin.from("fee_plans").insert({ school_id: temp.id, academic_year_id: tYear, level_id: tLevel, monthly_centimes: 100 }), "t plan");
    const tStudent = await student(temp.id, "Temp");
    must(await enroll(temp.id, tStudent, tYear, tClass), "t enroll");
    const tCharges = (await admin.from("student_charges").select("id").eq("school_id", temp.id)).data ?? [];
    const { error: tDelete } = await admin.from("schools").delete().eq("id", temp.id);
    check(label("a school with charges is deleted in one go (cascade, no refresh in the way)"),
      tCharges.length === 10 && !tDelete, `${tCharges.length} charges; ${tDelete?.message ?? "deleted"}`);
    if (tDelete) fx.createdSchoolIds.push(temp.id);
  } finally {
    await admin.from("student_enrollments").delete().in("class_id", [c1, c2, c3, cB]);
    await admin.from("students").delete().in("id", [s1, s2, s3, s4, s5, sB]);
    await admin.from("classes").delete().in("id", [c1, c2, c3, cB]);
    await admin.from("fee_services").delete().eq("academic_year_id", year);
    await admin.from("academic_years").delete().in("id", [year, yearB]);
    await admin.from("levels").delete().in("id", [L1, L2, L3, LB]);
    await admin.from("school_modules").delete().in("school_id", [A.id, B.id]).eq("module_key", "fees");
  }
}
