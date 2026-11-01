// Phase 13 step 7: fee_unpaid + fee_summary (migration phase13_fee_reports).
// Hand-computed amounts on a year covering today, billed months: two months
// ago, last month, this month (due TODAY when the day is ≤ 28), next month
// (not due); registration 500 DH, 1000 DH a month, due day = today's day:
//   s1 nothing paid · s2 1900 DH paid (registration, month −2, 400 of month −1)
//   s3 everything due paid (1000 yesterday + 2500 today) → not in the list
//   s4 3500 DH paid then the receipt cancelled → owes it all again
//   s5 month −1 cancelled (waived) · s6 in another class, nothing paid.
// Filters (class, month, registration), order by student_id, the summary's
// "collected this month" (cancelled receipts left out, yesterday only when it
// is the same month) and its unpaid total = the list's. Every caller without
// fees.view / the module, and another school, gets NO ROW; anon cannot call.
import { randomBytes, randomUUID } from "node:crypto";

import { check } from "./checks.mjs";
import { admin, anon, signIn } from "./fixtures.mjs";

const monthAdd = (month, n) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
};
const dayAdd = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export async function phase13FeeReports({ fx, as }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const label = (s) => `[P13 fee reports] ${s}`;
  const must = (r, what) => {
    if (r.error) throw new Error(`phase13FeeReports setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (q, what) => must(await q.select("id").single(), what).id;

  must(await admin.from("school_modules").upsert([
    { school_id: A.id, module_key: "fees", enabled: true },
    { school_id: B.id, module_key: "fees", enabled: true },
  ], { onConflict: "school_id,module_key" }), "fees module");
  const account = async (key, role) => {
    const email = `rls-test+${fx.run}-p13f${key}@example.com`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), key).user;
    fx.createdUserIds.push(user.id);
    must(await admin.from("profiles").insert({
      id: user.id, school_id: A.id, role_id: A.roles[role], full_name: `RLS p13f${key}`, must_change_password: false,
    }), `${key} profile`);
    return signIn({ email, password });
  };
  const acc = await account("acc", "accountant");
  const par = await account("par", "parent");

  // --- A year covering today, its months, two classes, six students -----------------------------------------
  const today = must(await as.dirA.rpc("school_clock").single(), "clock").local_date;
  const thisMonth = `${today.slice(0, 7)}-01`;
  const [past2, past1, fut1] = [-2, -1, 1].map((n) => monthAdd(thisMonth, n));
  const dueDay = Math.min(Number(today.slice(8, 10)), 28);
  const due = (month) => `${month.slice(0, 8)}${String(dueDay).padStart(2, "0")}`;
  const { data: existing } = await admin.from("academic_years").select("id, start_date, end_date").eq("school_id", A.id)
    .lte("start_date", today).gte("end_date", today).maybeSingle();
  if (existing && (existing.start_date > past2 || existing.end_date < monthAdd(fut1, 1))) {
    throw new Error("phase13FeeReports setup: school A's year of today does not cover the test months");
  }
  const createdYear = !existing;
  const year = existing?.id ?? await id(admin.from("academic_years").insert({
    school_id: A.id, label: `FR-${fx.run}`, start_date: monthAdd(thisMonth, -3), end_date: dayAdd(monthAdd(thisMonth, 5), -1), is_current: false,
  }), "year");
  must(await admin.from("fee_years").upsert({ school_id: A.id, academic_year_id: year, billing_months: [past2, past1, thisMonth, fut1], due_day: dueDay }), "fee year");
  const level = await id(admin.from("levels").insert({ school_id: A.id, cycle: "college", name: `FR ${fx.run}` }), "level");
  const clsA = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name: `FR-A ${fx.run}` }), "class A");
  const clsB = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name: `FR-B ${fx.run}` }), "class B");
  const kids = {};
  for (const [key, cls] of [["s1", clsA], ["s2", clsA], ["s3", clsA], ["s4", clsA], ["s5", clsA], ["s6", clsB]]) {
    kids[key] = await id(admin.from("students").insert({
      school_id: A.id, first_name: key, last_name: `FR ${fx.run}`, birth_date: "2014-01-01", gender: "male" }), key);
    must(await admin.from("student_enrollments").insert({ school_id: A.id, student_id: kids[key], academic_year_id: year, class_id: cls }), `${key} enrolled`);
  }
  must(await as.dirA.rpc("save_fee_plans", { p_year: year, p_rows: [{ level_id: level, registration_centimes: 50000, monthly_centimes: 100000 }] }), "plan");

  const summary = async (client) => client.rpc("fee_summary", { p_year: year });
  const before = must(await summary(as.dirA), "summary before")[0];
  const pay = async (student, amount, paidOn = today) => must(await as.dirA.rpc("record_payment", {
    p_student: student, p_year: year, p_amount: amount, p_method: "cash", p_paid_on: paidOn, p_idempotency_key: randomUUID(),
  }).single(), "payment").payment_id;
  await pay(kids.s2, 190000);
  await pay(kids.s3, 100000, dayAdd(today, -1));
  await pay(kids.s3, 250000);
  must(await as.dirA.rpc("cancel_payment", { p_payment: await pay(kids.s4, 350000), p_reason: "entry_error", p_note: null }), "cancel s4");
  const { data: s5Past1 } = await admin.from("student_charges").select("id").eq("student_id", kids.s5).eq("academic_year_id", year).eq("month", past1).single();
  must(await as.dirA.rpc("cancel_charge", { p_charge: s5Past1.id, p_reason: "waived", p_note: null }), "cancel s5 month");

  try {
    const unpaid = async (client, args = {}) => client.rpc("fee_unpaid", { p_year: year, ...args });
    const mine = (rows) => (rows ?? []).filter((r) => Object.values(kids).includes(r.student_id));
    const byKid = (rows) => Object.fromEntries(Object.entries(kids).map(([k, v]) => [k, rows.find((r) => r.student_id === v)]));
    const months = (r) => (r?.unpaid ?? []).map((m) => `${m.month ?? "reg"}=${m.balance}`).join(",");

    const all = await unpaid(as.dirA);
    const r = byKid(mine(all.data));
    check(label("director: s1 owes 3500 DH (registration + 3 months due), year balance 4500, oldest due = two months ago"),
      !all.error && r.s1?.due_centimes === 350000 && r.s1.year_balance_centimes === 450000 && r.s1.oldest_due_on === due(past2)
        && r.s1.class_id === clsA, all.error?.message ?? JSON.stringify(r.s1));
    check(label("…unpaid months in due order, registration first: registration, −2, −1, this month"),
      months(r.s1) === `reg=50000,${past2}=100000,${past1}=100000,${thisMonth}=100000`, months(r.s1));
    check(label(dueDay === Number(today.slice(8, 10)) ? "…this month's charge is due TODAY and counts" : "…(day > 28: this month due on the 28th, counts)"),
      r.s1?.unpaid.some((m) => m.month === thisMonth));
    check(label("…next month (not due yet) is not in the months"), !r.s1?.unpaid.some((m) => m.month === fut1));
    check(label("s2 part-paid: owes 600 of month −1 + this month = 1600 DH, year balance 2600"),
      r.s2?.due_centimes === 160000 && r.s2.year_balance_centimes === 260000 && months(r.s2) === `${past1}=60000,${thisMonth}=100000`,
      JSON.stringify(r.s2));
    check(label("s3 paid everything due → not in the list (even with next month still open)"), r.s3 === undefined);
    check(label("s4 receipt cancelled → owes the whole 3500 DH again"), r.s4?.due_centimes === 350000, JSON.stringify(r.s4));
    check(label("s5 month −1 cancelled → 2500 DH, without that month"),
      r.s5?.due_centimes === 250000 && !r.s5.unpaid.some((m) => m.month === past1), JSON.stringify(r.s5));
    check(label("s6 (other class) → 3500 DH, its class"), r.s6?.due_centimes === 350000 && r.s6.class_id === clsB);
    const ids = (all.data ?? []).map((x) => x.student_id);
    check(label("rows ordered by student_id (the app pages on it)"), ids.join() === [...ids].sort().join());

    const cls = await unpaid(as.dirA, { p_class: clsB });
    check(label("class filter → only that class"), !cls.error && mine(cls.data).length === 1 && mine(cls.data)[0].student_id === kids.s6);
    const month = await unpaid(as.dirA, { p_month: past1 });
    const m = byKid(mine(month.data));
    check(label("month −1 filter: s1 1000, s2 600, s4 1000, s6 1000; s5 (cancelled) and s3 absent"),
      !month.error && r && m.s1?.due_centimes === 100000 && m.s2?.due_centimes === 60000 && m.s4?.due_centimes === 100000
        && m.s6?.due_centimes === 100000 && !m.s5 && !m.s3 && months(m.s1) === `${past1}=100000`, JSON.stringify(mine(month.data)));
    check(label("…the year balance stays the whole year's"), m.s1?.year_balance_centimes === 450000);
    const mid = await unpaid(as.dirA, { p_month: dayAdd(past1, 14) });
    check(label("a day in the middle of the month = that month"), JSON.stringify(mine(mid.data)) === JSON.stringify(mine(month.data)));
    const reg = await unpaid(as.dirA, { p_registration: true });
    const g = byKid(mine(reg.data));
    check(label("registration filter: s1, s4, s5, s6 owe 500 DH; s2 and s3 paid it"),
      !reg.error && [g.s1, g.s4, g.s5, g.s6].every((x) => x?.due_centimes === 50000) && !g.s2 && !g.s3, JSON.stringify(mine(reg.data)));
    const both = await unpaid(as.dirA, { p_month: past1, p_registration: true });
    check(label("refused: a month AND registration → fees_report_filter_invalid"),
      both.error?.message === "fees_report_filter_invalid" && both.error.code === "22023", both.error?.message ?? "accepted!");
    const future = await unpaid(as.dirA, { p_month: fut1 });
    check(label("next month filter → nobody (not due)"), !future.error && mine(future.data).length === 0);

    const viaAcc = await unpaid(acc);
    check(label("accountant (fees.view) → the same rows"), JSON.stringify(mine(viaAcc.data)) === JSON.stringify(mine(all.data)));

    // --- Summary ---------------------------------------------------------------------------------------------
    const after = must(await summary(as.dirA), "summary after")[0];
    const sameMonth = dayAdd(today, -1).slice(0, 7) === today.slice(0, 7);
    const wantCollected = 190000 + 250000 + (sameMonth ? 100000 : 0);
    check(label(`collected this month: +${wantCollected / 100} DH, +${sameMonth ? 3 : 2} receipts (cancelled one out${sameMonth ? "" : "; yesterday was last month"})`),
      after.collected_month_centimes - before.collected_month_centimes === wantCollected
        && after.receipts_month - before.receipts_month === (sameMonth ? 3 : 2) && after.today === today,
      JSON.stringify({ before, after }));
    const list = all.data ?? [];
    check(label("unpaid total / students = the unpaid list's sum / count"),
      after.unpaid_centimes === list.reduce((n, x) => n + x.due_centimes, 0) && after.unpaid_students === list.length, JSON.stringify(after));
    if (createdYear) {
      check(label("…on the test's own year: 14 600 DH owed by 5 students"), after.unpaid_centimes === 1460000 && after.unpaid_students === 5);
    }
    const accSummary = must(await summary(acc), "acc summary");
    check(label("accountant → the same summary"), JSON.stringify(accSummary[0]) === JSON.stringify(after));

    // --- Nobody else -----------------------------------------------------------------------------------------
    for (const [name, client] of [["surveillant", as.survA], ["teacher", as.tchA], ["parent", par], ["deactivated account", as.deactA]]) {
      const [u, s] = await Promise.all([unpaid(client), summary(client)]);
      check(label(`${name} → no row (unpaid list and summary), no error`), !u.error && !s.error && u.data.length === 0 && s.data.length === 0,
        u.error?.message ?? s.error?.message ?? `${u.data.length} / ${s.data.length}`);
    }
    // B's director: nothing of A — A's year gives no unpaid row; the summary is B's own (collected = B's receipts only).
    const [uB, sB] = await Promise.all([unpaid(as.dirB), summary(as.dirB)]);
    const { data: bPaid } = await admin.from("payments").select("amount_centimes").eq("school_id", B.id).is("cancelled_at", null)
      .gte("paid_on", thisMonth).lte("paid_on", today);
    const bCollected = (bPaid ?? []).reduce((n, p) => n + p.amount_centimes, 0);
    check(label("director of B with A's year → no unpaid row; summary = B's own figures (0 unpaid, B's receipts only)"),
      !uB.error && uB.data.length === 0 && !sB.error && sB.data.length === 1 && sB.data[0].unpaid_centimes === 0
        && sB.data[0].unpaid_students === 0 && sB.data[0].collected_month_centimes === bCollected
        && sB.data[0].receipts_month === (bPaid ?? []).length,
      uB.error?.message ?? sB.error?.message ?? JSON.stringify(sB.data));
    const anonCall = await unpaid(anon());
    check(label("anon cannot call fee_unpaid"), !!anonCall.error, anonCall.error ? anonCall.error.code : "called!");
    const anonSummary = await summary(anon());
    check(label("anon cannot call fee_summary"), !!anonSummary.error, anonSummary.error ? anonSummary.error.code : "called!");
    must(await admin.from("school_modules").update({ enabled: false }).eq("school_id", A.id).eq("module_key", "fees"), "off");
    const [offU, offS] = await Promise.all([unpaid(as.dirA), summary(as.dirA)]);
    check(label("fees module off → the director gets no row"), !offU.error && offU.data.length === 0 && !offS.error && offS.data.length === 0);
    must(await admin.from("school_modules").update({ enabled: true }).eq("school_id", A.id).eq("module_key", "fees"), "on");
  } finally {
    await admin.from("school_modules").delete().in("school_id", [A.id, B.id]).eq("module_key", "fees");
    // Payments stay with fixture school A (removed with it at the end of the run).
  }
}
