// Phase 13 step 5b: receipt prints + staff names on receipts.
// record_receipt_print (fees.view): numbers 1, 2, 3… per payment, also when
// called at once; stores the language (fr / ar only); another school's payment
// is not found. receipt_prints is never written through the API (staff or
// server key) and read only by fees.view staff of the school.
// fee_staff_names (fees.view): only people who received or cancelled a payment
// of the caller's school — an existing staff member of the same school who is
// on no payment returns nothing; another school's caller gets nothing.
import { randomBytes, randomUUID } from "node:crypto";

import { check, rows } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";

export async function phase13ReceiptPrints({ fx, as }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const label = (s) => `[P13 receipt prints] ${s}`;
  const must = (r, what) => {
    if (r.error) throw new Error(`phase13ReceiptPrints setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (q, what) => must(await q.select("id").single(), what).id;
  const refused = (name, error, expected) =>
    check(label(`refused: ${name}`), !!error && (error.message === expected || error.code === expected),
      error ? `${error.code} ${error.message}` : "accepted!");

  must(await admin.from("school_modules").insert([
    { school_id: A.id, module_key: "fees", enabled: true },
    { school_id: B.id, module_key: "fees", enabled: true },
  ]), "fees module");
  const account = async (key, role) => {
    const email = `rls-test+${fx.run}-p13r${key}@example.com`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), key).user;
    fx.createdUserIds.push(user.id);
    must(await admin.from("profiles").insert({
      id: user.id, school_id: A.id, role_id: A.roles[role], full_name: `RLS p13r${key}`, must_change_password: false,
    }), `${key} profile`);
    return { id: user.id, client: await signIn({ email, password }) };
  };
  const acc = await account("acc", "accountant");
  const par = await account("par", "parent");

  const year = await id(admin.from("academic_years").insert({
    school_id: A.id, label: `P13R-${fx.run}`, start_date: "2094-09-01", end_date: "2095-06-30", is_current: false,
  }), "year");
  const level = await id(admin.from("levels").insert({ school_id: A.id, cycle: "college", name: `P13R ${fx.run}` }), "level");
  const cls = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name: `P13R ${fx.run}` }), "class");
  const student = await id(admin.from("students").insert({
    school_id: A.id, first_name: "Rim", last_name: `P13R ${fx.run}`, birth_date: "2014-01-01", gender: "female" }), "student");
  must(await admin.from("student_enrollments").insert({ school_id: A.id, student_id: student, academic_year_id: year, class_id: cls }), "enroll");
  must(await as.dirA.rpc("save_fee_plans", { p_year: year, p_rows: [{ level_id: level, registration_centimes: null, monthly_centimes: 100000 }] }), "plan");
  const today = must(await as.dirA.rpc("school_clock").single(), "clock").local_date;
  const pay = async (client) => must(await client.rpc("record_payment", {
    p_student: student, p_year: year, p_amount: 10000, p_method: "cash", p_paid_on: today, p_idempotency_key: randomUUID(),
  }).single(), "payment").payment_id;
  const p1 = await pay(acc.client);       // received by the accountant
  const p2 = await pay(as.dirA);          // received and then cancelled by the director
  must(await as.dirA.rpc("cancel_payment", { p_payment: p2, p_reason: "entry_error" }), "cancel");

  try {
    // --- fee_staff_names ---------------------------------------------------------------------------------
    const names = async (client, ids) => client.rpc("fee_staff_names", { p_ids: ids });
    const asked = [acc.id, fx.users.dirA.id, fx.users.survA.id];
    const got = await names(acc.client, asked);
    const ids = (got.data ?? []).map((r) => r.id).sort();
    check(label("accountant: the names of who received / cancelled A's payments (accountant + director)"),
      !got.error && ids.length === 2 && ids.includes(acc.id) && ids.includes(fx.users.dirA.id)
        && got.data.find((r) => r.id === acc.id)?.full_name === "RLS p13racc", got.error?.message ?? JSON.stringify(got.data));
    const surv = await names(acc.client, [fx.users.survA.id]);
    check(label("an existing staff member of the same school who is on no payment → nothing"),
      !surv.error && surv.data.length === 0, surv.error?.message ?? JSON.stringify(surv.data));
    const other = await names(as.dirB, asked);
    check(label("the director of B asking for A's people → nothing"), !other.error && other.data.length === 0,
      other.error?.message ?? JSON.stringify(other.data));
    refused("a teacher (no fees.view)", (await names(as.tchA, asked)).error, "fees_forbidden");
    refused("a parent", (await names(par.client, asked)).error, "fees_forbidden");
    refused("more than 200 ids", (await names(acc.client, Array.from({ length: 201 }, () => randomUUID()))).error, "fees_rows_invalid");

    // --- record_receipt_print ------------------------------------------------------------------------------
    const record = (client, payment, language) => client.rpc("record_receipt_print", { p_payment: payment, p_language: language }).single();
    refused("language 'en'", (await record(acc.client, p1, "en")).error, "fees_language_invalid");
    refused("a teacher", (await record(as.tchA, p1, "fr")).error, "fees_forbidden");
    refused("the director of B, A's payment", (await record(as.dirB, p1, "fr")).error, "fees_payment_not_found");
    refused("an unknown payment", (await record(acc.client, randomUUID(), "fr")).error, "fees_payment_not_found");
    const first = await record(acc.client, p1, "fr");
    check(label("first print of a payment = number 1"), !first.error && first.data?.print_no === 1, first.error?.message ?? JSON.stringify(first.data));
    const at = await Promise.all([0, 1, 2].map((i) => record(i === 1 ? as.dirA : acc.client, p1, i === 1 ? "ar" : "fr")));
    const nos = at.map((r) => r.data?.print_no).sort();
    check(label("three prints at once → 2, 3, 4 (no number twice)"), at.every((r) => !r.error) && nos.join() === "2,3,4",
      at.map((r) => r.error?.message ?? r.data?.print_no).join());
    const second = await record(acc.client, p2, "ar");
    check(label("another payment starts again at 1 (a cancelled one can be printed)"), second.data?.print_no === 1);
    const stored = (await admin.from("receipt_prints").select("print_no, language, printed_by, school_id").eq("payment_id", p1).order("print_no")).data ?? [];
    check(label("stored: 4 prints, one in Arabic by the director, the others in French by the accountant"),
      stored.length === 4 && stored.every((r) => r.school_id === A.id) && stored.filter((r) => r.language === "ar").length === 1
        && stored.find((r) => r.language === "ar")?.printed_by === fx.users.dirA.id && stored[0].printed_by === acc.id,
      JSON.stringify(stored.map((r) => [r.print_no, r.language])));

    // --- Never written through the API --------------------------------------------------------------------
    const row = { school_id: A.id, payment_id: p1, print_no: 99, language: "fr" };
    refused("accountant inserts a print", (await acc.client.from("receipt_prints").insert(row)).error, "42501");
    refused("director updates a print", (await as.dirA.from("receipt_prints").update({ print_no: 1 }).eq("payment_id", p1)).error, "42501");
    refused("director deletes a print", (await as.dirA.from("receipt_prints").delete().eq("payment_id", p1)).error, "42501");
    refused("server key inserts a print", (await admin.from("receipt_prints").insert(row)).error, "42501");
    refused("server key updates a print", (await admin.from("receipt_prints").update({ language: "ar" }).eq("payment_id", p1)).error, "42501");
    refused("server key deletes a print", (await admin.from("receipt_prints").delete().eq("payment_id", p1)).error, "42501");
    check(label("…still 4 prints"), ((await admin.from("receipt_prints").select("id").eq("payment_id", p1)).data ?? []).length === 4);

    // --- Reads ---------------------------------------------------------------------------------------------
    await rows(label("the accountant reads A's prints"), acc.client.from("receipt_prints").select("school_id").eq("payment_id", p1), 4);
    for (const [who, client] of [["a surveillant", as.survA], ["a teacher", as.tchA], ["a parent", par.client], ["the platform owner", as.owner]]) {
      await rows(label(`${who} reads no print`), client.from("receipt_prints").select("id"), 0);
    }
    await rows(label("the director of B reads none of A's prints"), as.dirB.from("receipt_prints").select("id").eq("school_id", A.id), 0);
    must(await admin.from("school_modules").update({ enabled: false }).eq("school_id", A.id).eq("module_key", "fees"), "off");
    await rows(label("fees module off: the accountant reads no print"), acc.client.from("receipt_prints").select("id"), 0);
    refused("fees module off: no print recorded", (await record(acc.client, p1, "fr")).error, "fees_forbidden");
    must(await admin.from("school_modules").update({ enabled: true }).eq("school_id", A.id).eq("module_key", "fees"), "on");
  } finally {
    await admin.from("school_modules").delete().in("school_id", [A.id, B.id]).eq("module_key", "fees");
    // Payments and prints stay with fixture school A (removed with it at the end of the run).
  }
}
