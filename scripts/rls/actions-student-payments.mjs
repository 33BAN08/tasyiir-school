// Phase 13 step 5 Server Actions + page: "Encaisser" (recordPayment,
// fees.manage), cancelling a receipt and a charge (cancelPayment /
// cancelCharge, fees.cancel), called over HTTP as real users on the student
// page; the months grid and the receipts list in the page's HTML. The
// allocation the dialog previews (src/lib/fees/ledger.ts) is compared with
// the one record_payment stores. One idempotency key = one payment, also for
// two calls at once. Payments are never deleted: they stay with fixture
// school A (removed with it at the end of the run).
import { randomBytes, randomUUID } from "node:crypto";

import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";

const { allocateOldestFirst, compareCharges } = await import("../../src/lib/fees/ledger.ts");

const FILE = "src/lib/fees/payment-actions.ts";
const ACTIONS = ["recordPayment", "cancelPayment", "cancelCharge"];

const monthAdd = (month, n) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
};
const dayAdd = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export async function studentPaymentActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const label = (s) => `[P13 payment action] ${s}`;
  const must = (r, what) => {
    if (r.error) throw new Error(`studentPaymentActions setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (q, what) => must(await q.select("id").single(), what).id;

  // --- Fixtures ------------------------------------------------------------------------------------------
  must(await admin.from("school_modules").insert([
    { school_id: A.id, module_key: "fees", enabled: true },
    { school_id: B.id, module_key: "fees", enabled: true },
  ]), "fees module");
  const email = `rls-test+${fx.run}-spacc@example.com`;
  const password = `${randomBytes(12).toString("base64url")}a1`;
  const accUser = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), "accountant").user;
  fx.createdUserIds.push(accUser.id);
  must(await admin.from("profiles").insert({
    id: accUser.id, school_id: A.id, role_id: A.roles.accountant, full_name: "RLS spacc", must_change_password: false,
  }), "accountant profile");
  const ids = Object.fromEntries(ACTIONS.map((name) => [name, actionId(FILE, name)]));
  const cookies = { accA: await sessionCookies({ email, password }) };
  for (const name of ["dirA", "survA", "tchA", "dirB"]) cookies[name] = await sessionCookies(fx.users[name]);

  // Months two before / one before / one after / two after this one: states that do not depend on the day.
  const today = must(await (await signIn(fx.users.dirA)).rpc("school_clock").single(), "clock").local_date;
  const thisMonth = `${today.slice(0, 7)}-01`;
  const [past1, past2, fut1, fut2] = [-2, -1, 1, 2].map((n) => monthAdd(thisMonth, n));
  const { data: existing } = await admin.from("academic_years").select("id, start_date, end_date").eq("school_id", A.id)
    .lte("start_date", today).gte("end_date", today).maybeSingle();
  if (existing && (existing.start_date > past1 || existing.end_date < monthAdd(fut2, 1))) {
    throw new Error("studentPaymentActions setup: school A's year of today does not cover the test months");
  }
  const year = existing?.id ?? await id(admin.from("academic_years").insert({
    school_id: A.id, label: `SP-${fx.run}`, start_date: monthAdd(thisMonth, -3), end_date: dayAdd(monthAdd(thisMonth, 5), -1), is_current: false,
  }), "year");
  const { data: currentBefore } = await admin.from("academic_years").select("id").eq("school_id", A.id).eq("is_current", true).maybeSingle();
  if (currentBefore && currentBefore.id !== year) must(await admin.from("academic_years").update({ is_current: false }).eq("id", currentBefore.id), "old current off");
  must(await admin.from("academic_years").update({ is_current: true }).eq("id", year), "current year");
  must(await admin.from("fee_years").upsert({ school_id: A.id, academic_year_id: year, billing_months: [past1, past2, fut1, fut2], due_day: 5 }), "fee year");
  const level = await id(admin.from("levels").insert({ school_id: A.id, cycle: "college", name: `SP 1AC ${fx.run}` }), "level");
  const cls = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name: `SP-A ${fx.run}` }), "class");
  const kid = (school, name) => id(admin.from("students").insert({
    school_id: school, first_name: name, last_name: `SP ${fx.run}`, birth_date: "2014-01-01", gender: "male" }), name);
  const amine = await kid(A.id, "Amine");
  const sara = await kid(A.id, "Sara");
  must(await admin.from("student_enrollments").insert([
    { school_id: A.id, student_id: amine, academic_year_id: year, class_id: cls },
    { school_id: A.id, student_id: sara, academic_year_id: year, class_id: cls },
  ]), "enrollments");
  must(await admin.from("fee_plans").insert({
    school_id: A.id, academic_year_id: year, level_id: level, registration_centimes: 100000, monthly_centimes: 120000 }), "plan");
  const bus = await id(admin.from("fee_services").insert({
    school_id: A.id, academic_year_id: year, name: `SP Transport ${fx.run}`, monthly_centimes: 40000 }), "service");
  must(await admin.from("student_services").insert({
    school_id: A.id, academic_year_id: year, student_id: amine, service_id: bus, from_month: past1, to_month: null }), "bus");

  const PAGE = `/fr/students/${amine}`;
  const call = (who, action, ...args) => callAction(baseUrl, { id: ids[action], path: PAGE, args, cookies: cookies[who] });
  const expect = async (name, promise, wanted, field) => {
    const r = await promise;
    const got = r.ok ? "ok" : r.error;
    check(label(name), got === wanted && (!field || r.field === field), `${got}${r.field ? ` (${r.field})` : ""}`);
    return r;
  };
  const html = async (who) => {
    const res = await fetch(new URL(PAGE, baseUrl), { headers: { cookie: cookies[who] }, redirect: "manual" });
    return res.status === 200 ? await res.text() : "";
  };
  /** data-month → data-month-state, from the rendered buttons. */
  const states = (page) => Object.fromEntries([...page.matchAll(/<button[^>]*data-month-state="[^"]*"[^>]*>/g)]
    .map(([tag]) => [/data-month="([\w-]+)"/.exec(tag)?.[1], /data-month-state="(\w+)"/.exec(tag)?.[1]]));
  const charges = async (s = amine) => (await admin.from("student_charges").select("*").eq("student_id", s).eq("academic_year_id", year)).data ?? [];
  const ledger = (rows) => rows.map((c) => ({
    id: c.id, kind: c.kind, month: c.month, serviceId: c.service_id, dueOn: c.due_on, gross: c.gross_centimes, net: c.net_centimes, paid: 0,
    cancelled: c.cancelled_at ? { reason: c.cancel_reason } : null,
  }));
  const allocations = async (payment) => (await admin.from("payment_allocations").select("charge_id, amount_centimes").eq("payment_id", payment)).data ?? [];
  const cash = (values) => ({ amount: "1500", method: "cash", paidOn: today, bank: "", reference: "", chequeDate: "", payerName: "", note: "", allocations: null, ...values });

  try {
    // --- Page before any payment ---------------------------------------------------------------------------
    let page = await html("dirA");
    let st = states(page);
    check(label("director: Encaisser + grid; registration and the two past months unpaid, the next two not due"),
      page.includes("data-pay-open") && st.registration === "unpaid" && st[past1] === "unpaid" && st[past2] === "unpaid"
        && st[fut1] === "notDue" && st[fut2] === "notDue", JSON.stringify(st));
    check(label("the totals: 1 000 + 4 × (1 200 + 400) = 7 400 DH"), page.replace(/[⁦⁩]/g, "").replace(/ /g, " ").includes("7 400,00 DH"));
    const accPage = await html("accA");
    check(label("accountant: Encaisser shown"), accPage.includes("data-pay-open"));
    check(label("surveillant: no fees card, no Encaisser"), !(await html("survA")).includes("data-pay-open"));

    // --- recordPayment: who and what -------------------------------------------------------------------------
    await expect("surveillant cannot take a payment", call("survA", "recordPayment", amine, year, cash({}), randomUUID()), "forbidden");
    await expect("teacher cannot take a payment", call("tchA", "recordPayment", amine, year, cash({}), randomUUID()), "forbidden");
    await expect("director of B: A's year → notFound", call("dirB", "recordPayment", amine, year, cash({}), randomUUID()), "notFound");
    await expect("a key that is not a uuid → idempotencyConflict", call("accA", "recordPayment", amine, year, cash({}), "abc"), "idempotencyConflict");
    await expect("no amount → amountRequired", call("accA", "recordPayment", amine, year, cash({ amount: "" }), randomUUID()), "amountRequired", "amount");
    await expect("'abc' → amountInvalid", call("accA", "recordPayment", amine, year, cash({ amount: "abc" }), randomUUID()), "amountInvalid", "amount");
    await expect("above the year's balance (7 400,01 DH) → amountAboveBalance",
      call("accA", "recordPayment", amine, year, cash({ amount: "7400,01" }), randomUUID()), "amountAboveBalance", "amount");
    await expect("tomorrow → paidOnInvalid", call("accA", "recordPayment", amine, year, cash({ paidOn: dayAdd(today, 1) }), randomUUID()), "paidOnInvalid", "paidOn");
    await expect("8 days ago → paidOnInvalid", call("accA", "recordPayment", amine, year, cash({ paidOn: dayAdd(today, -8) }), randomUUID()), "paidOnInvalid", "paidOn");
    await expect("a cheque without bank → bankRequired",
      call("accA", "recordPayment", amine, year, cash({ method: "cheque", reference: "123" }), randomUUID()), "bankRequired", "bank");
    await expect("a cheque without number → chequeNumberRequired",
      call("accA", "recordPayment", amine, year, cash({ method: "cheque", bank: "CIH" }), randomUUID()), "chequeNumberRequired", "reference");
    await expect("an unknown method → methodInvalid", call("accA", "recordPayment", amine, year, cash({ method: "card" }), randomUUID()), "methodInvalid");
    await expect("fees module off → forbidden", (async () => {
      must(await admin.from("school_modules").update({ enabled: false }).eq("school_id", A.id).eq("module_key", "fees"), "off");
      try { return await call("accA", "recordPayment", amine, year, cash({}), randomUUID()); }
      finally { must(await admin.from("school_modules").update({ enabled: true }).eq("school_id", A.id).eq("module_key", "fees"), "on"); }
    })(), "forbidden");
    check(label("no payment stored by the refused calls"), ((await admin.from("payments").select("id").eq("student_id", amine)).data ?? []).length === 0);

    // --- First payment: oldest first, as the preview says ------------------------------------------------------
    const before = ledger(await charges());
    const preview = allocateOldestFirst(before, 150000);
    const key1 = randomUUID();
    const first = await expect("accountant takes 1 500 DH cash (bank typed with cash is dropped)",
      call("accA", "recordPayment", amine, year, cash({ bank: "ignored", payerName: "Karim" }), key1), "ok");
    const p1 = first.data?.paymentId;
    const stored = (await admin.from("payments").select("*").eq("id", p1).single()).data;
    check(label("…receipt label '<year label>/000001', not replayed, bank null, payer kept, received by the accountant"),
      first.data?.replayed === false && /\/\d{6}$/.test(first.data?.receiptLabel ?? "") && stored?.receipt_label === first.data.receiptLabel
        && stored.bank === null && stored.payer_name === "Karim" && stored.received_by === accUser.id, JSON.stringify(first.data));
    const got = (await allocations(p1)).sort((a, b) => compareCharges(before.find((c) => c.id === a.charge_id), before.find((c) => c.id === b.charge_id)));
    check(label("…the database allocated exactly what the dialog previewed (registration 1 000, first month's tuition 500)"),
      JSON.stringify(got.map((a) => [a.charge_id, a.amount_centimes])) === JSON.stringify(preview.map((a) => [a.chargeId, a.amount]))
        && preview.length === 2 && preview[0].amount === 100000 && preview[1].amount === 50000, JSON.stringify({ got, preview }));
    const again = await expect("the same key again (double click) → ok", call("accA", "recordPayment", amine, year, cash({}), key1), "ok");
    check(label("…replayed, same payment"), again.data?.replayed === true && again.data.paymentId === p1, JSON.stringify(again.data));
    await expect("the same key with another amount → idempotencyConflict",
      call("accA", "recordPayment", amine, year, cash({ amount: "200" }), key1), "idempotencyConflict");
    const key2 = randomUUID();
    const both = await Promise.all([0, 1].map(() => call("accA", "recordPayment", amine, year, cash({ amount: "100" }), key2)));
    const keyed = (await admin.from("payments").select("id").eq("idempotency_key", key2)).data ?? [];
    check(label("two calls at once with one key → both ok, one payment, the other replayed"),
      both.every((r) => r.ok) && keyed.length === 1 && both.filter((r) => r.data.replayed).length === 1, JSON.stringify(both.map((r) => r.data ?? r.error)));
    page = await html("dirA");
    st = states(page);
    check(label("page: registration paid, first month partial"), st.registration === "paid" && st[past1] === "partial", JSON.stringify(st));
    check(label("page: two receipts listed, valid; the director sees Annuler"),
      (page.match(/data-payment-state="valid"/g) ?? []).length === 2 && page.includes("data-payment-cancel"));
    check(label("page: the accountant sees no Annuler"), !(await html("accA")).includes("data-payment-cancel"));

    // --- Staff-picked charges ------------------------------------------------------------------------------------
    const rows = await charges();
    const tuition = (m) => rows.find((c) => c.kind === "tuition" && c.month === m);
    const busOf = (m) => rows.find((c) => c.kind === "service" && c.month === m);
    const saraCharge = (await charges(sara)).find((c) => c.kind === "tuition");
    const pick = (list) => cash({ amount: "999", allocations: list });
    await expect("a picked charge of another student → allocationInvalid",
      call("accA", "recordPayment", amine, year, pick([{ chargeId: saraCharge.id, amount: 1000 }]), randomUUID()), "allocationInvalid", "allocations");
    await expect("a pick above the charge's balance → allocationInvalid",
      call("accA", "recordPayment", amine, year, pick([{ chargeId: tuition(fut2).id, amount: 120001 }]), randomUUID()), "allocationInvalid", "allocations");
    await expect("an empty pick list → allocationRequired",
      call("accA", "recordPayment", amine, year, pick([]), randomUUID()), "allocationRequired", "allocations");
    const picked = await expect("the last month's tuition (500 DH) + its bus in full, by cheque",
      call("accA", "recordPayment", amine, year, cash({
        method: "cheque", bank: "Attijariwafa", reference: "0012345", chequeDate: today, amount: "1",
        allocations: [{ chargeId: tuition(fut2).id, amount: 50000 }, { chargeId: busOf(fut2).id, amount: 40000 }],
      }), randomUUID()), "ok");
    const p3 = (await admin.from("payments").select("*").eq("id", picked.data?.paymentId).single()).data;
    const a3 = await allocations(picked.data?.paymentId);
    check(label("…amount = the picks' sum (900 DH, the typed amount ignored), cheque fields stored, exactly the two picks"),
      p3?.amount_centimes === 90000 && p3.bank === "Attijariwafa" && p3.reference === "0012345" && p3.cheque_date === today && a3.length === 2
        && a3.some((a) => a.charge_id === tuition(fut2).id && a.amount_centimes === 50000), JSON.stringify(a3));
    check(label("page: the last month partial (tuition 500 of 1 200, bus paid)"), states(await html("dirA"))[fut2] === "partial");

    // --- cancelPayment ---------------------------------------------------------------------------------------------
    await expect("the accountant cannot cancel a receipt", call("accA", "cancelPayment", p1, { reason: "entry_error", note: "" }), "forbidden");
    await expect("'other' without a note → cancelNoteRequired", call("dirA", "cancelPayment", p1, { reason: "other", note: " " }), "cancelNoteRequired", "note");
    await expect("an unknown reason → cancelReasonInvalid", call("dirA", "cancelPayment", p1, { reason: "lost", note: "" }), "cancelReasonInvalid", "reason");
    await expect("a note over 200 characters → tooLong", call("dirA", "cancelPayment", p1, { reason: "other", note: "x".repeat(201) }), "tooLong", "note");
    await expect("director of B cannot cancel A's receipt", call("dirB", "cancelPayment", p1, { reason: "entry_error", note: "" }), "notFound");
    await expect("director cancels the first receipt (entry error)", call("dirA", "cancelPayment", p1, { reason: "entry_error", note: "Mauvais élève" }), "ok");
    const c1 = (await admin.from("payments").select("cancelled_at, cancelled_by, cancel_reason, cancel_note").eq("id", p1).single()).data;
    check(label("…stored: reason, note, by the director"),
      !!c1?.cancelled_at && c1.cancelled_by === fx.users.dirA.id && c1.cancel_reason === "entry_error" && c1.cancel_note === "Mauvais élève");
    await expect("cancelling it again → paymentCancelled", call("dirA", "cancelPayment", p1, { reason: "entry_error", note: "" }), "paymentCancelled");
    page = await html("dirA");
    st = states(page);
    check(label("page: registration unpaid again, the receipt listed as cancelled"),
      st.registration === "unpaid" && page.includes(`data-payment="${p1}" data-payment-state="cancelled"`), JSON.stringify(st));

    // --- cancelCharge ------------------------------------------------------------------------------------------------
    const busNext = busOf(fut1);
    await expect("the accountant cannot cancel a charge", call("accA", "cancelCharge", busNext.id, { reason: "waived", note: "" }), "forbidden");
    await expect("'other' without a note → cancelNoteRequired", call("dirA", "cancelCharge", busNext.id, { reason: "other", note: "" }), "cancelNoteRequired", "note");
    await expect("a payment reason is not a charge reason → cancelReasonInvalid",
      call("dirA", "cancelCharge", busNext.id, { reason: "refund", note: "" }), "cancelReasonInvalid", "reason");
    await expect("director of B cannot cancel A's charge", call("dirB", "cancelCharge", busNext.id, { reason: "waived", note: "" }), "notFound");
    await expect("a charge with money on it → chargePaid", call("dirA", "cancelCharge", busOf(fut2).id, { reason: "waived", note: "" }), "chargePaid");
    await expect("director waives next month's bus", call("dirA", "cancelCharge", busNext.id, { reason: "waived", note: "Geste" }), "ok");
    const cc = (await admin.from("student_charges").select("cancelled_at, cancel_reason, cancel_note").eq("id", busNext.id).single()).data;
    check(label("…stored: waived, note kept"), !!cc?.cancelled_at && cc.cancel_reason === "waived" && cc.cancel_note === "Geste");
    await expect("cancelling it again → chargeCancelled", call("dirA", "cancelCharge", busNext.id, { reason: "waived", note: "" }), "chargeCancelled");
    check(label("page: next month still not due (its tuition is left)"), states(await html("dirA"))[fut1] === "notDue");

    // --- Audit: written by the database functions only (no second row from the actions) -------------------------------
    const logs = (await admin.from("audit_logs").select("action, actor_id, entity_id").eq("school_id", A.id)
      .in("action", ["fee_payment.record", "fee_payment.cancel", "fee_charge.cancel"]).eq("data->>student_id", amine)).data ?? [];
    const count = (a) => logs.filter((l) => l.action === a).length;
    check(label("audit: 3 payments recorded (replays not logged), 1 receipt + 1 charge cancelled by the director"),
      count("fee_payment.record") === 3 && count("fee_payment.cancel") === 1 && count("fee_charge.cancel") === 1
        && logs.filter((l) => l.action !== "fee_payment.record").every((l) => l.actor_id === fx.users.dirA.id),
      logs.map((l) => l.action).join());
  } finally {
    // Payments, their students, class, level and year stay with fixture school A (never deleted).
    if (currentBefore?.id !== year) {
      await admin.from("academic_years").update({ is_current: false }).eq("id", year);
      if (currentBefore) await admin.from("academic_years").update({ is_current: true }).eq("id", currentBefore.id);
    }
    await admin.from("school_modules").delete().in("school_id", [A.id, B.id]).eq("module_key", "fees");
  }
}
