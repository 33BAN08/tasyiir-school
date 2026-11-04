// Phase 13 step 8: my_children_fees + my_receipt, what a parent reads about fees.
// Exact field lists (a new field fails here), hand-computed amounts that agree
// with fee_unpaid, cancelled charges and receipts, and who gets NO ROW: another
// parent, staff, a student, another school, deactivated, password not changed,
// suspended school, module off, anon. Parents still read none of the fee tables
// directly, and a parent's reads record no print.
import { randomBytes, randomUUID } from "node:crypto";

import { check } from "./checks.mjs";
import { admin, anon, signIn } from "./fixtures.mjs";
import { randomMobile } from "./phase5-guardians.mjs";

const monthAdd = (month, n) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
};
const dayAdd = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const keys = (o) => Object.keys(o ?? {}).sort().join();

const CHILD_ROW = "academic_year_id,charges,is_current,receipts,student_id,today,year_label";
const CHARGE = "cancelled,discount,due_on,id,kind,month,net,paid,service_name,service_name_ar";
const RECEIPT_ROW = "amount,cancelled,cancelled_on,id,label,method,paid_on";
const RECEIPT = "amount_centimes,class_name,code_massar,first_name,first_name_ar,last_name,last_name_ar,lines,method,paid_on,payment_id,receipt_label,student_id,year_label";
const LINE = "amount,kind,month,partial,service_name,service_name_ar";

export async function phase13ParentFees({ fx, as }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const label = (s) => `[P13 parent fees] ${s}`;
  const must = (r, what) => {
    if (r.error) throw new Error(`phase13ParentFees setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (q, what) => must(await q.select("id").single(), what).id;

  must(await admin.from("school_modules").upsert([
    { school_id: A.id, module_key: "fees", enabled: true },
    { school_id: B.id, module_key: "fees", enabled: true },
  ], { onConflict: "school_id,module_key" }), "fees module");
  const account = async (key, school, role) => {
    const email = `rls-test+${fx.run}-p13g${key}@example.com`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), key).user;
    fx.createdUserIds.push(user.id);
    must(await admin.from("profiles").insert({
      id: user.id, school_id: school.id, role_id: school.roles[role], full_name: `RLS p13g${key}`, must_change_password: false,
    }), `${key} profile`);
    return { id: user.id, client: await signIn({ email, password }) };
  };
  const par = await account("par", A, "parent");
  const other = await account("oth", A, "parent");
  const acc = await account("acc", A, "accountant");
  const stu = await account("stu", A, "student");
  const parB = await account("parb", B, "parent");

  // A year covering today: registration + 3 months due, next month not due yet.
  const today = must(await as.dirA.rpc("school_clock").single(), "clock").local_date;
  const thisMonth = `${today.slice(0, 7)}-01`;
  const [past2, past1, fut1] = [-2, -1, 1].map((n) => monthAdd(thisMonth, n));
  const dueDay = Math.min(Number(today.slice(8, 10)), 28);
  const { data: existing } = await admin.from("academic_years").select("id, start_date, end_date").eq("school_id", A.id)
    .lte("start_date", today).gte("end_date", today).maybeSingle();
  if (existing && (existing.start_date > past2 || existing.end_date < monthAdd(fut1, 1))) {
    throw new Error("phase13ParentFees setup: school A's year of today does not cover the test months");
  }
  const year = existing?.id ?? await id(admin.from("academic_years").insert({
    school_id: A.id, label: `PF-${fx.run}`, start_date: monthAdd(thisMonth, -3), end_date: dayAdd(monthAdd(thisMonth, 5), -1), is_current: false,
  }), "year");
  const pastYear = await id(admin.from("academic_years").insert({
    school_id: A.id, label: `PFOLD-${fx.run}`, start_date: "2020-09-01", end_date: "2021-06-30", is_current: false,
  }), "other year");
  must(await admin.from("fee_years").upsert({ school_id: A.id, academic_year_id: year, billing_months: [past2, past1, thisMonth, fut1], due_day: dueDay }), "fee year");
  const level = await id(admin.from("levels").insert({ school_id: A.id, cycle: "college", name: `PF ${fx.run}` }), "level");
  const cls = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name: `PF-1 ${fx.run}` }), "class");
  const clsOld = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: pastYear, level_id: level, name: `PF-OLD ${fx.run}` }), "old class");
  const student = async (key, code) => {
    const sid = await id(admin.from("students").insert({
      school_id: A.id, first_name: key, last_name: `PF ${fx.run}`, first_name_ar: "ريم", last_name_ar: "بناني", birth_date: "2014-01-01", gender: "female", code_massar: code,
    }), key);
    must(await admin.from("student_enrollments").insert({ school_id: A.id, student_id: sid, academic_year_id: year, class_id: cls }), `${key} enrolled`);
    return sid;
  };
  const massar = `P${String(parseInt(fx.run, 16) % 1e9).padStart(9, "0")}`;
  const kid = await student("Rim", massar);
  const sibling = await student("Sami", null);
  const stranger = await student("Tarik", null);
  const link = async (profile, sid, tag, school = A) => {
    const g = await id(admin.from("guardians").insert({
      school_id: school.id, last_name: `PF ${tag}`, first_name: "Parent", phone: randomMobile(), profile_id: profile,
    }), `guardian ${tag}`);
    must(await admin.from("student_guardians").insert({ school_id: school.id, student_id: sid, guardian_id: g, relation: "mother" }), `link ${tag}`);
    return g;
  };
  const guardian = await link(par.id, kid, "par");
  must(await admin.from("student_guardians").insert({ school_id: A.id, student_id: sibling, guardian_id: guardian, relation: "mother" }), "link sibling");
  await link(other.id, stranger, "oth");

  // Plans: registration 500 DH, 1000 DH a month. Rim: 20 % scholarship on tuition (800 a month) + a service, 100 DH a month.
  must(await as.dirA.rpc("save_fee_plans", { p_year: year, p_rows: [{ level_id: level, registration_centimes: 50000, monthly_centimes: 100000 }] }), "plan");
  const service = await id(admin.from("fee_services").insert({
    school_id: A.id, academic_year_id: year, name: `Bus ${fx.run}`, name_ar: "النقل", monthly_centimes: 10000 }), "service");
  must(await as.dirA.from("student_services").insert({ school_id: A.id, academic_year_id: year, student_id: kid, service_id: service, from_month: past1, to_month: past1 }), "subscribe");
  const SECRET_REASON = `SECRET-DISCOUNT-${fx.run}`;
  must(await as.dirA.from("student_discounts").insert({
    school_id: A.id, academic_year_id: year, student_id: kid, kind: "scholarship", percent_bp: 2000, applies_to: "tuition", reason: SECRET_REASON }), "discount");

  const SECRET = { note: `SECRET-NOTE-${fx.run}`, payer: `SECRET-PAYER-${fx.run}`, bank: `SECRET-BANK-${fx.run}`, ref: `SECRET-REF-${fx.run}`, cancel: `SECRET-CANCEL-${fx.run}`, charge: `SECRET-CHARGE-${fx.run}` };
  const pay = async (client, values) => must(await client.rpc("record_payment", {
    p_student: kid, p_year: year, p_method: "cash", p_paid_on: today, p_idempotency_key: randomUUID(), ...values,
  }).single(), "payment");
  // 500 (registration) + 800 (month −2) + 100 of month −1's 800: oldest first.
  const valid = await pay(as.dirA, {
    p_amount: 140000, p_method: "cheque", p_bank: SECRET.bank, p_reference: SECRET.ref, p_cheque_date: today, p_payer_name: SECRET.payer, p_note: SECRET.note,
  });
  const voided = await pay(as.dirA, { p_amount: 10000, p_note: SECRET.note });
  must(await as.dirA.rpc("cancel_payment", { p_payment: voided.payment_id, p_reason: "other", p_note: SECRET.cancel }), "cancel receipt");
  // Sami's month −2 is cancelled.
  const { data: samiCharge } = await admin.from("student_charges").select("id").eq("student_id", sibling).eq("academic_year_id", year).eq("kind", "tuition").eq("month", past2).single();
  must(await as.dirA.rpc("cancel_charge", { p_charge: samiCharge.id, p_reason: "other", p_note: SECRET.charge }), "cancel charge");
  // School B: its own parent and fees, the control for "B's own users do".
  const yearB = await id(admin.from("academic_years").insert({ school_id: B.id, label: `PFB-${fx.run}`, start_date: "2052-09-01", end_date: "2053-06-30", is_current: false }), "year B");
  const levelB = await id(admin.from("levels").insert({ school_id: B.id, cycle: "college", name: `PFB ${fx.run}` }), "level B");
  const clsB = await id(admin.from("classes").insert({ school_id: B.id, academic_year_id: yearB, level_id: levelB, name: `PFB ${fx.run}` }), "class B");
  const kidB = await id(admin.from("students").insert({ school_id: B.id, first_name: "Omar", last_name: `PFB ${fx.run}`, birth_date: "2014-01-01", gender: "male" }), "student B");
  must(await admin.from("student_enrollments").insert({ school_id: B.id, student_id: kidB, academic_year_id: yearB, class_id: clsB }), "enrolled B");
  await link(parB.id, kidB, "parb", B);
  must(await as.dirB.rpc("save_fee_plans", { p_year: yearB, p_rows: [{ level_id: levelB, registration_centimes: 30000, monthly_centimes: 70000 }] }), "plan B");
  const paidB = must(await as.dirB.rpc("record_payment", {
    p_student: kidB, p_year: yearB, p_amount: 30000, p_method: "cash", p_paid_on: today, p_idempotency_key: randomUUID(),
  }).single(), "payment B");

  const fees = async (client) => client.rpc("my_children_fees");
  const receipt = async (client, payment) => client.rpc("my_receipt", { p_payment: payment });
  const printsOf = async (payment) => ((await admin.from("receipt_prints").select("id").eq("payment_id", payment)).data ?? []).length;
  const yearRows = (rows, sid) => (rows ?? []).filter((r) => r.student_id === sid);
  const none = async (name, client) => {
    const f = await fees(client);
    check(label(`${name}: my_children_fees gives no row`), !f.error && f.data.length === 0, f.error?.message ?? JSON.stringify(f.data).slice(0, 200));
    const r = await receipt(client, valid.payment_id);
    check(label(`${name}: my_receipt gives no row`), !r.error && r.data.length === 0, r.error?.message ?? JSON.stringify(r.data).slice(0, 200));
  };

  try {
    // --- The parent's own children: exact fields ------------------------------------------------------------
    const mine = await fees(par.client);
    check(label("the parent sees their two children and nobody else's"),
      !mine.error && mine.data.length === 2 && yearRows(mine.data, kid).length === 1 && yearRows(mine.data, sibling).length === 1,
      mine.error?.message ?? JSON.stringify((mine.data ?? []).map((r) => r.student_id)));
    const row = yearRows(mine.data, kid)[0];
    check(label("row: exactly the agreed fields"), keys(row) === CHILD_ROW, keys(row));
    check(label("…year + today from the database"), row?.academic_year_id === year && row.today === today, JSON.stringify([row?.academic_year_id, row?.today]));
    check(label("every charge: exactly the agreed fields"), row?.charges.length > 0 && row.charges.every((c) => keys(c) === CHARGE), keys(row?.charges[0]));
    check(label("every receipt row: exactly the agreed fields"), row?.receipts.length === 2 && row.receipts.every((r) => keys(r) === RECEIPT_ROW), keys(row?.receipts[0]));

    // --- Amounts, by hand ----------------------------------------------------------------------------------
    const tuition = (month) => row.charges.find((c) => c.kind === "tuition" && c.month === month);
    check(label("registration: 500 DH, no discount, fully paid"),
      (() => { const c = row.charges.find((x) => x.kind === "registration"); return c?.net === 50000 && c.discount === 0 && c.paid === 50000 && c.month === null; })(),
      JSON.stringify(row.charges.find((x) => x.kind === "registration")));
    check(label("tuition: net 800 + discount 200 (the amount; gross is not sent)"),
      tuition(thisMonth)?.net === 80000 && tuition(thisMonth).discount === 20000 && tuition(thisMonth).paid === 0, JSON.stringify(tuition(thisMonth)));
    check(label("oldest first: month −2 paid in full, month −1 part paid (100 of 800)"),
      tuition(past2)?.paid === 80000 && tuition(past1)?.paid === 10000, JSON.stringify([tuition(past2)?.paid, tuition(past1)?.paid]));
    const bus = row.charges.find((c) => c.kind === "service");
    check(label("a service carries its names (parents cannot read fee_services)"),
      bus?.service_name === `Bus ${fx.run}` && bus.service_name_ar === "النقل" && bus.month === past1 && bus.net === 10000, JSON.stringify(bus));
    const live = row.charges.filter((c) => !c.cancelled);
    const total = live.reduce((s, c) => s + c.net, 0);
    const paid = live.reduce((s, c) => s + Math.min(c.paid, c.net), 0);
    const dueNow = live.filter((c) => c.due_on <= today).reduce((s, c) => s + Math.max(0, c.net - c.paid), 0);
    check(label("year total 3800 DH (500 + 4 × 800 + 100), paid 1400, left 2400"), total === 380000 && paid === 140000 && total - paid === 240000, JSON.stringify({ total, paid }));
    const staff = must(await as.dirA.rpc("fee_unpaid", { p_year: year }), "fee_unpaid").find((r) => r.student_id === kid);
    check(label("due to date = fee_unpaid's figure for the same child, year balance too"),
      staff?.due_centimes === dueNow && staff.year_balance_centimes === total - paid, JSON.stringify({ staff, dueNow }));

    // --- Cancelled receipt + cancelled charge -------------------------------------------------------------
    const voidedRow = row.receipts.find((r) => r.id === voided.payment_id);
    check(label("cancelled receipt: listed, flagged, local date"), voidedRow?.cancelled === true && voidedRow.cancelled_on === today && voidedRow.amount === 10000, JSON.stringify(voidedRow));
    const validRow = row.receipts.find((r) => r.id === valid.payment_id);
    check(label("valid receipt: label, amount, method, date, no cancellation"),
      validRow?.label === valid.receipt_label && validRow.amount === 140000 && validRow.method === "cheque" && validRow.paid_on === today
        && validRow.cancelled === false && validRow.cancelled_on === null, JSON.stringify(validRow));
    check(label("newest receipt first"), row.receipts[0].id === voided.payment_id, row.receipts[0].id);
    const samiRow = yearRows(mine.data, sibling)[0];
    const samiCancelled = samiRow?.charges.find((c) => c.id === samiCharge.id);
    check(label("cancelled charge: flagged, net + discount + paid all 0"),
      samiCancelled?.cancelled === true && samiCancelled.net === 0 && samiCancelled.discount === 0 && samiCancelled.paid === 0, JSON.stringify(samiCancelled));

    // --- my_receipt ----------------------------------------------------------------------------------------
    const got = await receipt(par.client, valid.payment_id);
    const r = got.data?.[0];
    check(label("my_receipt: exactly the agreed fields"), !got.error && keys(r) === RECEIPT, got.error?.message ?? keys(r));
    check(label("…label, amount, method, date, child, Massar code, class, year"),
      r?.receipt_label === valid.receipt_label && r.amount_centimes === 140000 && r.method === "cheque" && r.paid_on === today && r.student_id === kid
        && r.first_name === "Rim" && r.code_massar === massar && r.class_name === `PF-1 ${fx.run}` && typeof r.year_label === "string", JSON.stringify(r));
    check(label("…lines: exactly the agreed fields"), r?.lines.length === 3 && r.lines.every((l) => keys(l) === LINE), keys(r?.lines[0]));
    check(label("…lines: registration, month −2 in full, month −1 partial"),
      r?.lines[0].kind === "registration" && r.lines[0].amount === 50000 && r.lines[0].partial === false
        && r.lines[1].month === past2 && r.lines[1].amount === 80000 && r.lines[1].partial === false
        && r.lines[2].month === past1 && r.lines[2].amount === 10000 && r.lines[2].partial === true, JSON.stringify(r?.lines));
    const text = JSON.stringify([mine.data, got.data]);
    for (const [name, secret] of [...Object.entries(SECRET), ["discount reason", SECRET_REASON]]) {
      check(label(`nothing returned holds the ${name}`), !text.includes(secret));
    }
    check(label("nothing returned holds the discount kind, a cancel reason code or a staff id"),
      !text.includes("scholarship") && !text.includes(`"other"`) && !text.includes(fx.users.dirA.id));
    const voidedReceipt = await receipt(par.client, voided.payment_id);
    check(label("a cancelled receipt: my_receipt gives no row"), !voidedReceipt.error && voidedReceipt.data.length === 0, JSON.stringify(voidedReceipt.data));
    for (const [name, value] of [["an unknown id", randomUUID()], ["null", null]]) {
      const u = await receipt(par.client, value);
      check(label(`${name}: no row, no error`), !u.error && u.data.length === 0, u.error?.message ?? JSON.stringify(u.data));
    }

    // --- A parent's read records no print; a second year with fee data ---------------------------------------
    check(label("reading records no print"), await printsOf(valid.payment_id) === 0);
    const refusedPrint = await par.client.rpc("record_receipt_print", { p_payment: valid.payment_id, p_language: "fr" });
    check(label("a parent cannot record a print"), refusedPrint.error?.message === "fees_forbidden", refusedPrint.error?.message ?? "accepted!");
    must(await admin.from("student_enrollments").insert({ school_id: A.id, student_id: kid, academic_year_id: pastYear, class_id: clsOld }), "past enrolment");
    must(await as.dirA.rpc("save_fee_plans", { p_year: pastYear, p_rows: [{ level_id: level, registration_centimes: 12300, monthly_centimes: null }] }), "past plan");
    const two = yearRows((await fees(par.client)).data, kid);
    check(label("a second year with fee data: one row per year, the later year first"),
      two.length === 2 && two[0].academic_year_id === year && two[1].academic_year_id === pastYear, JSON.stringify(two.map((x) => x.year_label)));

    // --- Who gets nothing -----------------------------------------------------------------------------------
    const otherSees = await fees(other.client);
    check(label("another parent of the school: only their own child"),
      !otherSees.error && otherSees.data.length === 1 && otherSees.data[0].student_id === stranger, JSON.stringify(otherSees.data?.map((x) => x.student_id)));
    const otherReceipt = await receipt(other.client, valid.payment_id);
    check(label("another parent of the school: not this child's receipt"), !otherReceipt.error && otherReceipt.data.length === 0, JSON.stringify(otherReceipt.data));
    await none("the director", as.dirA);
    await none("the accountant", acc.client);
    await none("a surveillant", as.survA);
    await none("a teacher", as.tchA);
    await none("a student", stu.client);
    await none("the director of B", as.dirB);
    const bSees = await fees(parB.client);
    check(label("B's parent: only B's child (control: they do have fee data)"),
      !bSees.error && bSees.data.length === 1 && bSees.data[0].student_id === kidB && bSees.data[0].charges.length > 0, JSON.stringify(bSees.data?.map((x) => x.student_id)));
    const bOwn = await receipt(parB.client, paidB.payment_id);
    check(label("B's parent reads their own receipt"), !bOwn.error && bOwn.data.length === 1, bOwn.error?.message ?? "no row");
    const bOnA = await receipt(parB.client, valid.payment_id);
    check(label("B's parent: A's receipt gives no row"), !bOnA.error && bOnA.data.length === 0, JSON.stringify(bOnA.data));
    const aOnB = await receipt(par.client, paidB.payment_id);
    check(label("A's parent: B's receipt gives no row"), !aOnB.error && aOnB.data.length === 0, JSON.stringify(aOnB.data));
    for (const [name, call] of [["my_children_fees", () => fees(anon())], ["my_receipt", () => receipt(anon(), valid.payment_id)]]) {
      const res = await call();
      check(label(`anon cannot call ${name}`), res.error?.code === "42501", res.error?.code ?? "accepted!");
    }

    // --- The account's or the school's state ------------------------------------------------------------------
    const toggle = async (name, table, match, on, off) => {
      must(await admin.from(table).update(on).match(match), `${name} on`);
      try {
        await none(`the parent, ${name}`, par.client);
      } finally {
        must(await admin.from(table).update(off).match(match), `${name} off`);
      }
    };
    await toggle("account deactivated", "profiles", { id: par.id }, { deactivated_at: new Date().toISOString() }, { deactivated_at: null });
    await toggle("password not changed yet", "profiles", { id: par.id }, { must_change_password: true }, { must_change_password: false });
    await toggle("school suspended", "schools", { id: A.id }, { status: "suspended", suspended_at: new Date().toISOString() }, { status: "active", suspended_at: null });
    await toggle("fees module off", "school_modules", { school_id: A.id, module_key: "fees" }, { enabled: false }, { enabled: true });
    const back = await fees(par.client);
    check(label("control: all restored, the parent reads again"), !back.error && back.data.length === 3, back.error?.message ?? String(back.data.length));

    // --- Parents still read no fee table directly ------------------------------------------------------------
    for (const table of ["student_charges", "payments", "payment_allocations", "receipt_prints", "student_discounts", "fee_services", "fee_plans", "fee_years", "student_services"]) {
      const { data, error } = await par.client.from(table).select("*").limit(5);
      check(label(`direct read of ${table}: nothing`), !!error || data.length === 0, error?.code ?? JSON.stringify(data).slice(0, 120));
    }

    // --- The server key has no signed-in user: no school, no row --------------------------------------------
    const server = await fees(admin);
    check(label("the server key: my_children_fees gives no row"), (server.data ?? []).length === 0, JSON.stringify(server.data).slice(0, 120));
  } finally {
    must(await admin.from("schools").update({ status: "active", suspended_at: null }).eq("id", A.id), "school back");
  }
}
