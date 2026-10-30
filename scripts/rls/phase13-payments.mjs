// Phase 13 step 4: payments. record_payment (fees.manage): oldest due first
// with overflow, or the staff's own list; refused above the year's balance,
// outside today − 7 → today, without cheque details. Receipt numbers per
// school + year, gapless under concurrency, label = [prefix-]year/000123. One
// idempotency key = one payment, even at once. cancel_payment (fees.cancel)
// returns the money to unpaid. Payments and allocations are never changed or
// deleted through the API — not by staff, not with the server key, not after
// set_config('tasyir.fees_purge', 'on'). A charge that has had money on it is
// never changed by the refresh. A student with payments cannot be deleted;
// a school with payments can.
import { randomBytes, randomUUID } from "node:crypto";

import { check, denied, rows } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";

export async function phase13Payments({ fx, as }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const label = (s) => `[P13 payments] ${s}`;
  const must = (r, what) => {
    if (r.error) throw new Error(`phase13Payments setup: ${what} (${r.error.code ?? r.error.message})`);
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
  const account = async (school, roles, key, role) => {
    const email = `rls-test+${fx.run}-p13p${key}@example.com`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), key).user;
    fx.createdUserIds.push(user.id);
    must(await admin.from("profiles").insert({
      id: user.id, school_id: school, role_id: roles[role], full_name: `RLS p13p${key}`, must_change_password: false,
    }), `${key} profile`);
    return { id: user.id, client: await signIn({ email, password }) };
  };
  const acc = await account(A.id, A.roles, "acc", "accountant");
  const accA = acc.client;
  const parA = (await account(A.id, A.roles, "par", "parent")).client;

  const yearLabel = `P13P-${fx.run}`;
  const year = await id(admin.from("academic_years").insert({
    school_id: A.id, label: yearLabel, start_date: "2092-09-01", end_date: "2093-06-30", is_current: false,
  }), "year");
  const yearB = await id(admin.from("academic_years").insert({
    school_id: B.id, label: `P13P-${fx.run}`, start_date: "2092-09-01", end_date: "2093-06-30", is_current: false,
  }), "year B");
  const level = (school, name) => id(admin.from("levels").insert({ school_id: school, cycle: "college", name: `${name} ${fx.run}` }), name);
  const L1 = await level(A.id, "P1AC");
  const L2 = await level(A.id, "P2AC");   // no plan: nothing due
  const LB = await level(B.id, "PB");
  const klass = (school, y, l, name) => id(admin.from("classes").insert({ school_id: school, academic_year_id: y, level_id: l, name: `${name} ${fx.run}` }), name);
  const c1 = await klass(A.id, year, L1, "P1");
  const c2 = await klass(A.id, year, L2, "P2");
  const cB = await klass(B.id, yearB, LB, "PB");
  const student = (school, name) => id(admin.from("students").insert({
    school_id: school, first_name: name, last_name: `P13P ${fx.run}`, birth_date: "2014-01-01", gender: "male" }), name);
  const [s1, s2, s3, s4, s5] = [await student(A.id, "Anas"), await student(A.id, "Basma"), await student(A.id, "Chadi"),
    await student(A.id, "Dounia"), await student(A.id, "Ezza")];
  const sB = await student(B.id, "Omar");
  const enroll = (school, s, y, c) => admin.from("student_enrollments").insert({ school_id: school, student_id: s, academic_year_id: y, class_id: c });
  for (const s of [s1, s2, s3, s4]) must(await enroll(A.id, s, year, c1), "enroll");
  must(await enroll(A.id, s5, year, c2), "enroll s5");
  must(await enroll(B.id, sB, yearB, cB), "enroll sB");
  must(await as.dirA.rpc("save_fee_plans", { p_year: year, p_rows: [{ level_id: L1, registration_centimes: 150000, monthly_centimes: 100000 }] }), "plan A");
  must(await as.dirB.rpc("save_fee_plans", { p_year: yearB, p_rows: [{ level_id: LB, registration_centimes: null, monthly_centimes: 50000 }] }), "plan B");

  const today = must(await as.dirA.rpc("school_clock").single(), "clock").local_date;
  const shift = (days) => new Date(Date.parse(`${today}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const pay = (client, values) => client.rpc("record_payment", {
    p_year: year, p_method: "cash", p_paid_on: today, p_idempotency_key: randomUUID(), ...values,
  }).single();
  const charges = async (s) => (await admin.from("student_charges").select("*").eq("student_id", s)
    .order("due_on").order("kind").order("month", { nullsFirst: true })).data ?? [];
  const paidOf = async (chargeId) => {
    const { data } = await admin.from("payment_allocations").select("amount_centimes, payments(cancelled_at)").eq("charge_id", chargeId);
    return (data ?? []).filter((a) => !a.payments.cancelled_at).reduce((n, a) => n + a.amount_centimes, 0);
  };
  const allocationsOf = async (paymentId) => (await admin.from("payment_allocations").select("charge_id, amount_centimes")
    .eq("payment_id", paymentId)).data ?? [];

  let tempSchool = null;
  try {
    // --- Who may record -----------------------------------------------------------------------------------
    for (const [who, client, expected] of [["a surveillant", as.survA, "fees_forbidden"], ["a teacher", as.tchA, "fees_forbidden"],
      ["a parent", parA, "fees_forbidden"], ["suspended school C's director", as.dirC, "fees_forbidden"],
      ["the platform owner", as.owner, "fees_forbidden"], ["the director of B (A's year)", as.dirB, "fees_year_not_found"]]) {
      refused(`record_payment by ${who}`, (await pay(client, { p_student: s1, p_amount: 1000 })).error, expected);
    }
    const { error: anonPay } = await pay(as.anon, { p_student: s1, p_amount: 1000 });
    check(label("record_payment signed out: refused"), !!anonPay, anonPay?.code ?? "accepted!");
    refused("B's student in A's year", (await pay(accA, { p_student: sB, p_amount: 1000 })).error, "fees_student_not_found");

    // --- Oldest due first, overflow, receipt numbers + labels ------------------------------------------------
    const list1 = await charges(s1);
    const reg1 = list1.find((c) => c.kind === "registration");
    const month1 = (m) => list1.find((c) => c.kind === "tuition" && c.month === m);
    const { data: p1, error: p1Error } = await pay(accA, { p_student: s1, p_amount: 200000, p_payer_name: "  Le père  " });
    check(label("the accountant records 2 000 DH cash: receipt 1, label <year>/000001"),
      !p1Error && p1?.receipt_no === 1 && p1.receipt_label === `${yearLabel}/000001` && p1.replayed === false,
      p1Error?.message ?? JSON.stringify(p1));
    let alloc = await allocationsOf(p1.payment_id);
    check(label("…the registration first (1 500 DH), then 500 DH on September"),
      alloc.length === 2 && alloc.find((a) => a.charge_id === reg1.id)?.amount_centimes === 150000
        && alloc.find((a) => a.charge_id === month1("2092-09-01").id)?.amount_centimes === 50000, JSON.stringify(alloc));
    const row1 = (await admin.from("payments").select("*").eq("id", p1.payment_id).single()).data;
    check(label("…received_by = the accountant (from the session), payer name trimmed, no bank / reference for cash"),
      row1?.received_by === acc.id && row1.payer_name === "Le père" && row1.bank === null && row1.reference === null
        && row1.paid_on === today, JSON.stringify(row1));
    const audit1 = (await admin.from("audit_logs").select("action, actor_id, data").eq("entity_id", p1.payment_id)).data ?? [];
    check(label("…audit fee_payment.record: receipt label, amount, method, student, by the accountant"),
      audit1.length === 1 && audit1[0].action === "fee_payment.record" && audit1[0].actor_id === acc.id
        && audit1[0].data.receipt === `${yearLabel}/000001` && audit1[0].data.amount_centimes === 200000
        && audit1[0].data.method === "cash" && audit1[0].data.student_id === s1, JSON.stringify(audit1));
    const { data: p2 } = await pay(accA, { p_student: s1, p_amount: 100000 });
    alloc = await allocationsOf(p2.payment_id);
    check(label("receipt 2 (1 000 DH): the rest of September, then October"),
      p2.receipt_no === 2 && alloc.find((a) => a.charge_id === month1("2092-09-01").id)?.amount_centimes === 50000
        && alloc.find((a) => a.charge_id === month1("2092-10-01").id)?.amount_centimes === 50000, JSON.stringify(alloc));
    const { data: p3 } = await pay(accA, { p_student: s1, p_amount: 300000 });
    alloc = await allocationsOf(p3.payment_id);
    check(label("receipt 3 (3 000 DH) overflows in order: October 500, November, December 1 000, January 500"),
      p3.receipt_no === 3 && alloc.length === 4 && alloc.find((a) => a.charge_id === month1("2093-01-01").id)?.amount_centimes === 50000
        && alloc.find((a) => a.charge_id === month1("2092-12-01").id)?.amount_centimes === 100000, JSON.stringify(alloc));
    // Year: 1 500 + 10 × 1 000 = 11 500 DH; paid 6 000 DH; left 5 500 DH.
    refused("5 500,01 DH when 5 500 DH are left", (await pay(accA, { p_student: s1, p_amount: 550001 })).error, "fees_amount_above_balance");
    refused("a student with nothing due", (await pay(accA, { p_student: s5, p_amount: 100 })).error, "fees_nothing_due");

    // --- Date window, amounts, methods, lengths -------------------------------------------------------------
    refused("tomorrow", (await pay(accA, { p_student: s1, p_amount: 100, p_paid_on: shift(1) })).error, "fees_paid_on_invalid");
    refused("8 days ago", (await pay(accA, { p_student: s1, p_amount: 100, p_paid_on: shift(-8) })).error, "fees_paid_on_invalid");
    const { data: p7d, error: p7dError } = await pay(accA, { p_student: s1, p_amount: 100, p_paid_on: shift(-7) });
    check(label("7 days ago is accepted"), !p7dError && p7d?.receipt_no === 4, p7dError?.message ?? "");
    refused("an amount of 0", (await pay(accA, { p_student: s1, p_amount: 0 })).error, "fees_amount_invalid");
    refused("method 'card'", (await pay(accA, { p_student: s1, p_amount: 100, p_method: "card" })).error, "fees_method_invalid");
    refused("a cheque without its bank", (await pay(accA, { p_student: s1, p_amount: 100, p_method: "cheque", p_reference: "0012345" })).error,
      "fees_cheque_details_required");
    refused("a cheque without its number", (await pay(accA, { p_student: s1, p_amount: 100, p_method: "cheque", p_bank: "CIH" })).error,
      "fees_cheque_details_required");
    const { data: pc } = await pay(accA, { p_student: s1, p_amount: 100, p_method: "cheque", p_bank: "CIH", p_reference: "0012345", p_cheque_date: today });
    const pcRow = (await admin.from("payments").select("*").eq("id", pc.payment_id).single()).data;
    check(label("a cheque with bank, number and date is kept as given"),
      pcRow?.bank === "CIH" && pcRow.reference === "0012345" && pcRow.cheque_date === today, JSON.stringify(pcRow));
    const { data: pt } = await pay(accA, { p_student: s1, p_amount: 100, p_method: "transfer", p_reference: "VIR-77", p_cheque_date: today });
    const ptRow = (await admin.from("payments").select("bank, reference, cheque_date").eq("id", pt.payment_id).single()).data;
    check(label("a transfer: reference kept, no cheque date"), ptRow?.reference === "VIR-77" && ptRow.cheque_date === null, JSON.stringify(ptRow));
    const { data: pcash } = await pay(accA, { p_student: s1, p_amount: 100, p_bank: "BMCE", p_reference: "x" });
    const cashRow = (await admin.from("payments").select("bank, reference").eq("id", pcash.payment_id).single()).data;
    check(label("cash: a bank / reference sent anyway is dropped"), cashRow?.bank === null && cashRow.reference === null);
    refused("a payer name of 101 characters", (await pay(accA, { p_student: s1, p_amount: 100, p_payer_name: "x".repeat(101) })).error, "23514");
    refused("a note of 201 characters", (await pay(accA, { p_student: s1, p_amount: 100, p_note: "x".repeat(201) })).error, "23514");

    // --- Prefix -------------------------------------------------------------------------------------------
    const months = (await accA.rpc("fee_year_rules", { p_year: year }).single()).data.billing_months;
    const before = JSON.stringify((await charges(s1)).map((c) => c.updated_at));
    must(await accA.from("fee_years").insert({ school_id: A.id, academic_year_id: year, billing_months: months, due_day: 5, receipt_prefix: "MDR" })
      .select("academic_year_id"), "prefix");
    must(await accA.from("fee_years").update({ receipt_prefix: "MDR2" }).eq("academic_year_id", year).select("academic_year_id"), "prefix 2");
    check(label("a prefix change refreshes no charge"), JSON.stringify((await charges(s1)).map((c) => c.updated_at)) === before);
    const { data: pp } = await pay(accA, { p_student: s1, p_amount: 100 });
    check(label("with a prefix: MDR2-<year>/000008 (the two refused inserts above used no number)"),
      pp?.receipt_label === `MDR2-${yearLabel}/000008`, pp?.receipt_label);
    check(label("…earlier receipts keep their label"),
      (await admin.from("payments").select("receipt_label").eq("id", p1.payment_id).single()).data?.receipt_label === `${yearLabel}/000001`);
    refused("a prefix '-MDR'", (await accA.from("fee_years").update({ receipt_prefix: "-MDR" }).eq("academic_year_id", year)
      .select("academic_year_id")).error, "23514");
    await denied(label("a surveillant cannot set the prefix"),
      as.survA.from("fee_years").update({ receipt_prefix: "X" }).eq("academic_year_id", year).select("academic_year_id"));

    // --- The staff's own list ------------------------------------------------------------------------------
    const list2 = await charges(s2);
    const reg2 = list2.find((c) => c.kind === "registration");
    const mar2 = list2.find((c) => c.kind === "tuition" && c.month === "2093-03-01");
    const pick = (items, amount) => pay(accA, { p_student: s2, p_amount: amount, p_allocations: items });
    refused("a list with another student's charge",
      (await pick([{ charge_id: reg1.id, amount_centimes: 100 }], 100)).error, "fees_allocation_invalid");
    refused("an amount above the charge's balance",
      (await pick([{ charge_id: mar2.id, amount_centimes: 100001 }], 100001)).error, "fees_allocation_invalid");
    refused("the same charge twice",
      (await pick([{ charge_id: mar2.id, amount_centimes: 100 }, { charge_id: mar2.id, amount_centimes: 100 }], 200)).error, "fees_allocation_invalid");
    refused("an amount of 0 in the list",
      (await pick([{ charge_id: mar2.id, amount_centimes: 0 }], 0)).error, "fees_amount_invalid");
    refused("a charge id 'x'", (await pick([{ charge_id: "x", amount_centimes: 100 }], 100)).error, "fees_allocation_invalid");
    refused("a list that does not add up", (await pick([{ charge_id: mar2.id, amount_centimes: 500 }], 600)).error,
      "fees_allocation_total_mismatch");
    const { data: pk, error: pkError } = await pick([{ charge_id: mar2.id, amount_centimes: 50000 }, { charge_id: reg2.id, amount_centimes: 150000 }], 200000);
    alloc = pk ? await allocationsOf(pk.payment_id) : [];
    check(label("the accountant's own list: March 500 DH + registration 1 500 DH, exactly"),
      !pkError && alloc.length === 2 && alloc.find((a) => a.charge_id === mar2.id)?.amount_centimes === 50000
        && alloc.find((a) => a.charge_id === reg2.id)?.amount_centimes === 150000, pkError?.message ?? JSON.stringify(alloc));
    const { data: pAfter } = await pay(accA, { p_student: s2, p_amount: 100000 });
    alloc = await allocationsOf(pAfter.payment_id);
    check(label("…the next default payment starts with September (oldest open), not March"),
      alloc.length === 1 && alloc[0].charge_id === list2.find((c) => c.month === "2092-09-01").id);

    // --- 10 payments at once: numbers without a gap; one key at once: one payment --------------------------
    const counterBefore = (await admin.from("receipt_counters").select("last_no").eq("academic_year_id", year).single()).data.last_no;
    const burst = await Promise.all(Array.from({ length: 10 }, () => pay(accA, { p_student: s3, p_amount: 1000 })));
    const numbers = burst.map((r) => r.data?.receipt_no).sort((a, b) => a - b);
    check(label("10 payments at once: all saved, numbers follow with no gap"),
      burst.every((r) => !r.error) && numbers.join() === Array.from({ length: 10 }, (_, i) => counterBefore + 1 + i).join(),
      `${numbers.join()} ${burst.map((r) => r.error?.message).filter(Boolean).join(", ")}`);
    const key = randomUUID();
    const same = await Promise.all([1, 2, 3].map(() => pay(accA, { p_student: s3, p_amount: 2000, p_idempotency_key: key })));
    const ids = new Set(same.map((r) => r.data?.payment_id));
    const withKey = (await admin.from("payments").select("id").eq("idempotency_key", key)).data ?? [];
    check(label("the same idempotency key 3 times at once: one payment, two replays"),
      same.every((r) => !r.error) && ids.size === 1 && withKey.length === 1 && same.filter((r) => r.data?.replayed).length === 2,
      `${withKey.length} payment(s); ${same.map((r) => r.error?.message ?? r.data?.replayed).join(", ")}`);
    refused("the same key for another amount", (await pay(accA, { p_student: s3, p_amount: 2001, p_idempotency_key: key })).error,
      "fees_idempotency_conflict");
    const { data: pB, error: pBError } = await as.dirB.rpc("record_payment", {
      p_student: sB, p_year: yearB, p_amount: 2000, p_method: "cash", p_paid_on: today, p_idempotency_key: key,
    }).single();
    check(label("school B may use the same key (keys are unique per school): its own receipt 1"),
      !pBError && pB?.replayed === false && pB.receipt_no === 1, pBError?.message ?? JSON.stringify(pB));

    // --- Never changed, never deleted ----------------------------------------------------------------------
    await denied(label("the director cannot update a payment (no grant)"),
      as.dirA.from("payments").update({ amount_centimes: 1 }).eq("id", p1.payment_id).select("id"));
    await denied(label("the director cannot delete a payment (no grant)"),
      as.dirA.from("payments").delete().eq("id", p1.payment_id).select("id"));
    await denied(label("the director cannot insert a payment directly"), as.dirA.from("payments").insert({
      school_id: A.id, academic_year_id: year, student_id: s1, receipt_no: 999, receipt_label: "x", amount_centimes: 1,
      method: "cash", paid_on: today, idempotency_key: randomUUID(),
    }).select("id"));
    await denied(label("the director cannot delete an allocation"),
      as.dirA.from("payment_allocations").delete().eq("payment_id", p1.payment_id).select("charge_id"));
    const { error: keyUpd } = await admin.from("payments").update({ amount_centimes: 1 }).eq("id", p1.payment_id).select("id");
    check(label("the server key cannot change an amount"), !!keyUpd, keyUpd?.message ?? "accepted!");
    const { error: keyCancel } = await admin.from("payments")
      .update({ cancelled_at: new Date().toISOString(), cancel_reason: "refund" }).eq("id", p1.payment_id).select("id");
    check(label("the server key cannot cancel by writing the columns (only cancel_payment)"), !!keyCancel, keyCancel?.message ?? "accepted!");
    const { error: keyDel } = await admin.from("payments").delete().eq("id", p1.payment_id).select("id");
    check(label("the server key cannot delete a payment"), !!keyDel, keyDel?.message ?? "accepted!");
    const { error: keyAllocDel } = await admin.from("payment_allocations").delete().eq("payment_id", p1.payment_id).select("charge_id");
    check(label("the server key cannot delete an allocation"), !!keyAllocDel, keyAllocDel?.message ?? "accepted!");
    const { error: keyAllocUpd } = await admin.from("payment_allocations").update({ amount_centimes: 1 }).eq("payment_id", p1.payment_id).select("charge_id");
    check(label("the server key cannot change an allocation"), !!keyAllocUpd, keyAllocUpd?.message ?? "accepted!");
    // set_config('tasyir.fees_purge', 'on') first: not reachable through the API, and every request is its own transaction.
    for (const [who, client] of [["the accountant", accA], ["the director", as.dirA], ["the server key", admin]]) {
      const { error: cfg } = await client.rpc("set_config", { setting_name: "tasyir.fees_purge", new_value: "on", is_local: false });
      check(label(`${who}: set_config('tasyir.fees_purge', 'on') is not reachable`), !!cfg, cfg?.code ?? "accepted!");
      const { data: del, error: delErr } = await client.from("payments").delete().eq("id", p1.payment_id).select("id");
      const { data: upd, error: updErr } = await client.from("payments").update({ amount_centimes: 1 }).eq("id", p1.payment_id).select("id");
      check(label(`${who}: after that, deleting / changing a payment is still refused`),
        (!!delErr || del?.length === 0) && (!!updErr || upd?.length === 0), `${delErr?.message ?? del?.length} / ${updErr?.message ?? upd?.length}`);
    }
    const still = (await admin.from("payments").select("amount_centimes, cancelled_at").eq("id", p1.payment_id).single()).data;
    check(label("…receipt 1 is intact: 2 000 DH, not cancelled"), still?.amount_centimes === 200000 && still.cancelled_at === null);

    // --- cancel_payment -------------------------------------------------------------------------------------
    refused("the accountant cancels (fees.cancel)", (await accA.rpc("cancel_payment", { p_payment: p2.payment_id, p_reason: "refund" })).error,
      "fees_forbidden");
    refused("the director of B cancels A's receipt", (await as.dirB.rpc("cancel_payment", { p_payment: p2.payment_id, p_reason: "refund" })).error,
      "fees_payment_not_found");
    refused("an unknown reason", (await as.dirA.rpc("cancel_payment", { p_payment: p2.payment_id, p_reason: "lost" })).error,
      "fees_cancel_reason_invalid");
    refused("'other' without a note", (await as.dirA.rpc("cancel_payment", { p_payment: p2.payment_id, p_reason: "other" })).error,
      "fees_cancel_note_required");
    const sepPaidBefore = await paidOf(month1("2092-09-01").id);
    const { error: cancelError } = await as.dirA.rpc("cancel_payment", { p_payment: p2.payment_id, p_reason: "bounced_cheque", p_note: "Chèque sans provision" });
    const p2Row = (await admin.from("payments").select("*").eq("id", p2.payment_id).single()).data;
    check(label("the director cancels receipt 2 (bounced cheque): who, when, reason, note; amount and number kept"),
      !cancelError && p2Row?.cancel_reason === "bounced_cheque" && p2Row.cancel_note === "Chèque sans provision"
        && p2Row.cancelled_by === fx.users.dirA.id && p2Row.cancelled_at !== null && p2Row.amount_centimes === 100000 && p2Row.receipt_no === 2,
      cancelError?.message ?? JSON.stringify(p2Row));
    check(label("…its 1 000 DH are unpaid again (September 1 000 → 500, October 1 000 → 500)"),
      sepPaidBefore === 100000 && await paidOf(month1("2092-09-01").id) === 50000 && await paidOf(month1("2092-10-01").id) === 50000);
    refused("cancelling it twice", (await as.dirA.rpc("cancel_payment", { p_payment: p2.payment_id, p_reason: "refund" })).error,
      "fees_payment_cancelled");
    const audit2 = (await admin.from("audit_logs").select("action, actor_id, data").eq("entity_id", p2.payment_id).eq("action", "fee_payment.cancel")).data ?? [];
    check(label("…audit fee_payment.cancel by the director, with the reason"),
      audit2.length === 1 && audit2[0].actor_id === fx.users.dirA.id && audit2[0].data.reason === "bounced_cheque");
    const { data: pNext } = await pay(accA, { p_student: s1, p_amount: 100 });
    check(label("the next receipt does not reuse a cancelled number"), pNext?.receipt_no > p2Row.receipt_no && pNext.receipt_no !== 2);

    // --- A charge that has had money on it is never changed by the refresh ---------------------------------
    const list4 = await charges(s4);
    const oct4 = list4.find((c) => c.kind === "tuition" && c.month === "2092-10-01");
    const { data: p4 } = await pay(accA, { p_student: s4, p_amount: 30000, p_allocations: [{ charge_id: oct4.id, amount_centimes: 30000 }] });
    must(await as.dirA.rpc("save_fee_plans", { p_year: year, p_rows: [{ level_id: L1, registration_centimes: 150000, monthly_centimes: 120000 }] }), "price 1 200");
    let after4 = await charges(s4);
    check(label("price 1 000 → 1 200 DH: October (300 DH paid) stays 1 000 DH, November becomes 1 200 DH"),
      after4.find((c) => c.id === oct4.id)?.gross_centimes === 100000
        && after4.find((c) => c.kind === "tuition" && c.month === "2092-11-01")?.gross_centimes === 120000);
    must(await accA.from("fee_years").update({ billing_months: months.filter((m) => m !== "2092-10-01") }).eq("academic_year_id", year)
      .select("academic_year_id"), "drop October");
    after4 = await charges(s4);
    check(label("October dropped from the billed months: the paid October charge is kept"),
      after4.some((c) => c.id === oct4.id) && !(await charges(s1)).some((c) => c.month === "2092-10-01" && c.id !== month1("2092-10-01").id));
    must(await as.dirA.rpc("cancel_payment", { p_payment: p4.payment_id, p_reason: "entry_error" }), "cancel p4");
    must(await as.dirA.rpc("save_fee_plans", { p_year: year, p_rows: [{ level_id: L1, registration_centimes: 150000, monthly_centimes: 130000 }] }), "price 1 300");
    after4 = await charges(s4);
    check(label("after its payment is cancelled: October still kept at 1 000 DH (had money once), 300 DH due again"),
      after4.find((c) => c.id === oct4.id)?.gross_centimes === 100000 && await paidOf(oct4.id) === 0);
    refused("cancel_charge refuses a charge with money on it",
      (await as.dirA.rpc("cancel_charge", { p_charge: month1("2092-09-01").id, p_reason: "waived" })).error, "fees_charge_paid");
    must(await admin.from("student_enrollments").delete().eq("student_id", s4).eq("academic_year_id", year), "end s4");
    after4 = await charges(s4);
    check(label("enrollment ended: only the October charge (had money) is left"),
      after4.length === 1 && after4[0].id === oct4.id, JSON.stringify(after4.map((c) => [c.kind, c.month])));

    // --- Reads ---------------------------------------------------------------------------------------------
    for (const t of ["payments", "payment_allocations", "receipt_counters"]) {
      await rows(label(`${t}: the accountant reads A's rows`), accA.from(t).select("school_id"),
        (l) => l.length > 0 && l.every((r) => r.school_id === A.id));
      for (const [who, client] of [["a surveillant", as.survA], ["a teacher", as.tchA], ["a parent", parA], ["the platform owner", as.owner]]) {
        await rows(label(`${t}: ${who} reads nothing`), client.from(t).select("school_id"), 0);
      }
      await rows(label(`${t}: the director of B reads none of A's`), as.dirB.from(t).select("school_id").eq("school_id", A.id), 0);
    }

    // --- Deleting: a student with payments no; a school with payments yes ------------------------------------
    const { error: delStudent } = await admin.from("students").delete().eq("id", s1);
    check(label("a student with payments cannot be deleted"), delStudent?.code === "23503", delStudent?.code ?? "deleted!");
    const temp = must(await admin.from("schools").insert({ name: `P13P temp ${fx.run}`, slug: `rls-test-p13p-${fx.run}` }).select("id").single(), "temp");
    tempSchool = temp.id;
    const tempRoles = Object.fromEntries((must(await admin.from("roles").select("id, key").eq("school_id", temp.id), "temp roles")).map((r) => [r.key, r.id]));
    must(await admin.from("school_modules").insert({ school_id: temp.id, module_key: "fees", enabled: true }), "temp module");
    const tDir = await account(temp.id, tempRoles, "tdir", "director");
    const tYear = await id(admin.from("academic_years").insert({ school_id: temp.id, label: "T", start_date: "2092-09-01", end_date: "2093-06-30" }), "t year");
    const tLevel = await level(temp.id, "TL");
    const tClass = await klass(temp.id, tYear, tLevel, "TC");
    const tStudent = await student(temp.id, "Temp");
    must(await enroll(temp.id, tStudent, tYear, tClass), "t enroll");
    must(await tDir.client.rpc("save_fee_plans", { p_year: tYear, p_rows: [{ level_id: tLevel, registration_centimes: null, monthly_centimes: 1000 }] }), "t plan");
    const { error: tPayError } = await tDir.client.rpc("record_payment", {
      p_student: tStudent, p_year: tYear, p_amount: 1500, p_method: "cash", p_paid_on: today, p_idempotency_key: randomUUID(),
    }).single();
    const { error: tDelete } = await admin.from("schools").delete().eq("id", temp.id);
    check(label("a school with payments is deleted in one go (its own cascade, run as the table owner)"),
      !tPayError && !tDelete, `${tPayError?.message ?? "paid"}; ${tDelete?.message ?? "deleted"}`);
    if (!tDelete) tempSchool = null;
  } finally {
    if (tempSchool) fx.createdSchoolIds.push(tempSchool);
    await admin.from("school_modules").delete().in("school_id", [A.id, B.id]).eq("module_key", "fees");
    // Payments stay with fixture schools A and B (removed with them at the end of the run).
  }
}
