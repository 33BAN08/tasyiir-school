// Phase 13 step 7 pages + CSV exports + dashboard tiles, over HTTP as real
// users: the unpaid list (/fees: class / month filters, parents' phones),
// the journal (/fees/journal: totals per method without cancelled receipts,
// cheques, earlier receipts cancelled in the range), the CSV route
// (/[locale]/fees/export: BOM, ";", CRLF, formulas neutralised, phones
// "06 12 34 56 78", refused without fees.view / module, audited) and the
// dashboard's "Encaissé ce mois" / "Impayés à date" (the accountant sees only
// those two). Payments stay with fixture school A.
import { randomBytes, randomUUID } from "node:crypto";

import { sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";

const monthAdd = (month, n) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
};
const dayAdd = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const digits = (s) => (s ?? "").replace(/\D/g, "");
const phone = (first) => `+212${first}${String(randomBytes(4).readUInt32BE() % 100_000_000).padStart(8, "0")}`;
const local = (p) => `0${p.slice(4)}`.replace(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, "$1 $2 $3 $4 $5");

export async function feeReportActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const label = (s) => `[P13 fee reports page] ${s}`;
  const must = (r, what) => {
    if (r.error) throw new Error(`feeReportActions setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (q, what) => must(await q.select("id").single(), what).id;

  // --- Fixtures ------------------------------------------------------------------------------------------
  must(await admin.from("school_modules").upsert([
    { school_id: A.id, module_key: "fees", enabled: true },
    { school_id: B.id, module_key: "fees", enabled: true },
  ], { onConflict: "school_id,module_key" }), "fees module");
  const email = `rls-test+${fx.run}-fracc@example.com`;
  const password = `${randomBytes(12).toString("base64url")}a1`;
  const accUser = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), "accountant").user;
  fx.createdUserIds.push(accUser.id);
  must(await admin.from("profiles").insert({
    id: accUser.id, school_id: A.id, role_id: A.roles.accountant, full_name: "RLS fracc", must_change_password: false,
  }), "accountant profile");
  const cookies = { accA: await sessionCookies({ email, password }) };
  for (const name of ["dirA", "survA", "tchA", "dirB"]) cookies[name] = await sessionCookies(fx.users[name]);
  const dir = await signIn(fx.users.dirA);

  const today = must(await dir.rpc("school_clock").single(), "clock").local_date;
  const thisMonth = `${today.slice(0, 7)}-01`;
  const [past1, fut1] = [-1, 1].map((n) => monthAdd(thisMonth, n));
  const dueDay = Math.min(Number(today.slice(8, 10)), 28);
  const { data: existing } = await admin.from("academic_years").select("id, start_date, end_date").eq("school_id", A.id)
    .lte("start_date", today).gte("end_date", today).maybeSingle();
  if (existing && (existing.start_date > past1 || existing.end_date < monthAdd(fut1, 1))) {
    throw new Error("feeReportActions setup: school A's year of today does not cover the test months");
  }
  const year = existing?.id ?? await id(admin.from("academic_years").insert({
    school_id: A.id, label: `FRP-${fx.run}`, start_date: monthAdd(thisMonth, -3), end_date: dayAdd(monthAdd(thisMonth, 5), -1), is_current: false,
  }), "year");
  const { data: currentBefore } = await admin.from("academic_years").select("id").eq("school_id", A.id).eq("is_current", true).maybeSingle();
  if (currentBefore && currentBefore.id !== year) must(await admin.from("academic_years").update({ is_current: false }).eq("id", currentBefore.id), "old current off");
  must(await admin.from("academic_years").update({ is_current: true }).eq("id", year), "current year");
  must(await admin.from("fee_years").upsert({ school_id: A.id, academic_year_id: year, billing_months: [past1, thisMonth, fut1], due_day: dueDay }), "fee year");
  const level = await id(admin.from("levels").insert({ school_id: A.id, cycle: "college", name: `FRP ${fx.run}` }), "level");
  const cls = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name: `FRP-A ${fx.run}` }), "class");
  const kid = async (last, first) => {
    const s = await id(admin.from("students").insert({ school_id: A.id, first_name: first, last_name: last, birth_date: "2014-01-01", gender: "male" }), first);
    must(await admin.from("student_enrollments").insert({ school_id: A.id, student_id: s, academic_year_id: year, class_id: cls }), `${first} enrolled`);
    return s;
  };
  const evil = `=HYPERLINK("http://evil.example","x")`;
  const k1 = await kid(evil, "Kid");            // owes everything due; two parents
  const k2 = await kid(`FRP ${fx.run}`, "Sara"); // pays everything due by cheque
  const k3 = await kid(`FRP ${fx.run}`, "Omar"); // a receipt dated yesterday, cancelled today
  const father = phone(6);
  const mother = phone(7);
  const g1 = await id(admin.from("guardians").insert({ school_id: A.id, last_name: "Benali", first_name: "Karim", phone: father }), "father");
  const g2 = await id(admin.from("guardians").insert({ school_id: A.id, last_name: "Benali", first_name: "Nadia", phone: mother }), "mother");
  must(await admin.from("student_guardians").insert([
    { school_id: A.id, student_id: k1, guardian_id: g1, relation: "father" },
    { school_id: A.id, student_id: k1, guardian_id: g2, relation: "mother" },
  ]), "links");
  must(await dir.rpc("save_fee_plans", { p_year: year, p_rows: [{ level_id: level, registration_centimes: null, monthly_centimes: 100000 }] }), "plan");
  const pay = async (student, amount, extra = {}) => must(await dir.rpc("record_payment", {
    p_student: student, p_year: year, p_amount: amount, p_method: "cash", p_paid_on: today, p_idempotency_key: randomUUID(), ...extra,
  }).single(), "payment").payment_id;
  const pk1 = await pay(k1, 10000);
  must(await dir.rpc("cancel_payment", { p_payment: pk1, p_reason: "entry_error", p_note: null }), "cancel k1");
  const pk2 = await pay(k2, 200000, { p_method: "cheque", p_bank: "CIH", p_reference: "445566", p_payer_name: "-cmd|calc" });
  const pk3 = await pay(k3, 5000, { p_paid_on: dayAdd(today, -1) });
  must(await dir.rpc("cancel_payment", { p_payment: pk3, p_reason: "refund", p_note: null }), "cancel k3");

  const get = async (path, who) => {
    const res = await fetch(new URL(path, baseUrl), { headers: who ? { cookie: cookies[who] } : {}, redirect: "manual" });
    // Decoded keeping the BOM (res.text() drops it).
    const body = res.status === 200 ? new TextDecoder("utf-8", { ignoreBOM: true }).decode(await res.arrayBuffer()) : "";
    return { status: res.status, body, type: res.headers.get("content-type") ?? "", disposition: res.headers.get("content-disposition") ?? "" };
  };
  const sentAway = (r) => [302, 303, 307, 308].includes(r.status) || r.body.includes("NEXT_REDIRECT");
  const dueOf = (html, student) => Number(new RegExp(`data-unpaid-row="${student}" data-unpaid-due="(\\d+)"`).exec(html)?.[1] ?? NaN);
  const attr = (html, re) => re.exec(html)?.[1];

  try {
    // --- Unpaid list ---------------------------------------------------------------------------------------
    const page = await get(`/fr/fees?year=${year}`, "dirA");
    check(label("director: k1 owes last month + this month (2000 DH); k2 (paid) and k3 not listed"),
      page.status === 200 && dueOf(page.body, k1) === 200000 && !page.body.includes(`data-unpaid-row="${k2}"`), `${page.status} ${dueOf(page.body, k1)}`);
    check(label("…the parents' phones with call links, shown 06 / 07 …"),
      page.body.includes(`data-guardian-phone="${father}"`) && page.body.includes(`href="tel:${father}"`) && page.body.includes(local(father))
        && page.body.includes(`data-guardian-phone="${mother}"`));
    const list = must(await dir.rpc("fee_unpaid", { p_year: year }), "list");
    check(label("…the summary total and count = fee_unpaid's"),
      attr(page.body, /data-unpaid-summary="[^"]*" data-total="(\d+)"/) === String(list.reduce((n, r) => n + r.due_centimes, 0))
        && attr(page.body, /data-count="(\d+)"/) === String(list.length));
    check(label("…the tabs, Impayés active, and the CSV link"),
      page.body.includes("data-fees-tabs") && /aria-current="page"[^>]*>Impayés/.test(page.body) && page.body.includes("data-unpaid-export"));
    const monthPage = await get(`/fr/fees?year=${year}&month=${past1.slice(0, 7)}`, "dirA");
    check(label("month filter: k1 owes 1000 DH for last month"), dueOf(monthPage.body, k1) === 100000, String(dueOf(monthPage.body, k1)));
    const regPage = await get(`/fr/fees?year=${year}&month=registration&class=${cls}`, "dirA");
    check(label("registration filter (no registration fee in this plan) → nobody of the class, 'Aucun impayé pour ce choix'"),
      !regPage.body.includes(`data-unpaid-row="${k1}"`) && regPage.body.includes("Aucun impayé pour ce choix"));
    const ar = await get(`/ar/fees?year=${year}`, "dirA");
    check(label("Arabic page: k1 listed, Arabic tabs"), dueOf(ar.body, k1) === 200000 && ar.body.includes("المتأخرات"));
    const accPage = await get(`/fr/fees?year=${year}`, "accA");
    check(label("accountant: the same list with the phones (students.view)"),
      dueOf(accPage.body, k1) === 200000 && accPage.body.includes(`data-guardian-phone="${father}"`));
    check(label("surveillant (no fees.view) → sent home"), sentAway(await get("/fr/fees", "survA")));
    check(label("teacher → sent home"), sentAway(await get("/fr/fees/journal", "tchA")));
    const bPage = await get(`/fr/fees?year=${year}`, "dirB");
    check(label("director of B with A's year in the URL → B's own page, nothing of A"),
      bPage.status === 200 && !bPage.body.includes(k1) && !bPage.body.includes(father));

    // --- Journal -------------------------------------------------------------------------------------------
    const journal = await get(`/fr/fees/journal?from=${today}&to=${today}`, "dirA");
    const { data: todays } = await admin.from("payments").select("amount_centimes, method, cancelled_at").eq("school_id", A.id).eq("paid_on", today);
    const valid = (todays ?? []).filter((p) => !p.cancelled_at);
    const sum = (rows) => rows.reduce((n, p) => n + p.amount_centimes, 0);
    check(label("journal of today: total = A's valid receipts of today (the cancelled one left out)"),
      attr(journal.body, /data-journal-total="total" data-amount="(\d+)"/) === String(sum(valid))
        && attr(journal.body, /data-journal-total="cheque" data-amount="(\d+)"/) === String(sum(valid.filter((p) => p.method === "cheque"))),
      `${attr(journal.body, /data-journal-total="total" data-amount="(\d+)"/)} vs ${sum(valid)}`);
    check(label("…k1's cancelled receipt listed as cancelled, k2's as valid"),
      journal.body.includes(`data-journal-payment="${pk1}" data-journal-state="cancelled"`) && journal.body.includes(`data-journal-payment="${pk2}" data-journal-state="valid"`));
    check(label("…k2's cheque in the cheques list (CIH, 445566)"), journal.body.includes(`data-journal-cheque="${pk2}"`) && journal.body.includes("445566"));
    check(label("…k3's receipt of yesterday, cancelled today: in 'earlier receipts cancelled', not in the receipts"),
      journal.body.includes(`data-journal-cancellation="${pk3}"`) && !journal.body.includes(`data-journal-payment="${pk3}"`));
    const defaultJournal = await get("/fr/fees/journal", "accA");
    check(label("no dates → this month (1st → today), accountant allowed"),
      defaultJournal.body.includes(`data-journal-from="${thisMonth}" data-journal-to="${today}"`));
    const badJournal = await get(`/fr/fees/journal?from=${today}&to=${dayAdd(today, -3)}`, "dirA");
    check(label("dates the wrong way round → this month"), badJournal.body.includes(`data-journal-from="${thisMonth}"`));
    const arJournal = await get(`/ar/fees/journal?from=${today}&to=${today}`, "dirA");
    check(label("Arabic journal renders its totals"), arJournal.body.includes(`data-journal-total="total"`) && arJournal.body.includes("سجل الأداءات"));

    // --- CSV -----------------------------------------------------------------------------------------------
    const csv = await get(`/fr/fees/export?report=unpaid&year=${year}`, "dirA");
    const lines = csv.body.split("\r\n");
    const k1Line = lines.find((l) => l.includes("HYPERLINK")) ?? "";
    check(label("unpaid CSV: text/csv UTF-8, attachment, BOM, ';', CRLF, French header"),
      csv.status === 200 && csv.type.startsWith("text/csv") && /charset=utf-8/i.test(csv.type) && /^attachment; filename="impayes-\d{4}-\d{2}-\d{2}\.csv"$/.test(csv.disposition)
        && csv.body.startsWith("﻿Élève;Nom en arabe;Classe;Mois impayés;Dû à ce jour (DH)") && csv.body.endsWith("\r\n") && !/[^\r]\n/.test(csv.body),
      `${csv.status} ${csv.type} ${csv.disposition} ${JSON.stringify(lines[0])}`);
    check(label("…a student named =HYPERLINK(…) comes out with an apostrophe first (text, not a formula)"),
      k1Line.startsWith(`"'=HYPERLINK(""http://evil.example"",""x"") Kid"`), k1Line.slice(0, 60));
    const cells = k1Line.split(";");
    check(label("…phones written 06 12 34 56 78 / 07 …: no apostrophe, no quotes, leading zero kept"),
      cells.includes(local(father)) && cells.includes(local(mother)) && !k1Line.includes(`'${local(father)}`) && !k1Line.includes(`"${local(father)}`),
      k1Line);
    check(label("…amount 2000,00 and the parents 'Père : Benali Karim' / 'Mère : Benali Nadia'"),
      cells.includes("2000,00") && cells.includes("Père : Benali Karim") && cells.includes("Mère : Benali Nadia"), k1Line);
    const arCsv = await get(`/ar/fees/export?report=unpaid&year=${year}`, "dirA");
    check(label("Arabic CSV: Arabic header, same phones"), arCsv.body.startsWith("﻿التلميذ;") && arCsv.body.includes(local(father)));
    const jCsv = await get(`/fr/fees/export?report=journal&from=${today}&to=${today}`, "accA");
    const jLines = jCsv.body.split("\r\n");
    check(label("journal CSV (accountant): k2's cheque with its number, payer '-cmd|calc' neutralised"),
      jCsv.status === 200 && jLines.some((l) => l.includes("445566") && l.includes("'-cmd|calc") && l.includes("Chèque") && l.includes("2000,00")),
      jLines.find((l) => l.includes("445566")) ?? `${jCsv.status}`);
    check(label("…k1's cancelled receipt 'Annulé le … : Erreur de saisie'; k3 as 'Annulation d'un reçu antérieur'"),
      jLines.some((l) => l.includes("Annulé le") && l.includes("Erreur de saisie")) && jLines.some((l) => l.startsWith("Annulation d'un reçu antérieur") && l.includes("Remboursement")));
    const exports = (await admin.from("audit_logs").select("data").eq("school_id", A.id).eq("action", "fee_report.export")).data ?? [];
    check(label("each export is in the audit log (unpaid + journal)"),
      exports.some((e) => e.data?.report === "unpaid") && exports.some((e) => e.data?.report === "journal"), String(exports.length));
    const refusedStatuses = [
      (await get(`/fr/fees/export?report=unpaid&year=${year}`, "survA")).status,
      (await get("/fr/fees/export?report=journal", "tchA")).status,
      (await get("/fr/fees/export?report=journal")).status,
      (await get(`/fr/fees/export?report=unpaid&year=${year}`, "dirB")).status,
      (await get("/fr/fees/export?report=other", "dirA")).status,
    ];
    check(label("CSV refused: surveillant 403, teacher 403, no session → sign-in redirect (307), director of B with A's year 404, unknown report 400"),
      refusedStatuses.join() === "403,403,307,404,400", refusedStatuses.join());

    // --- Dashboard -----------------------------------------------------------------------------------------
    const summary = must(await dir.rpc("fee_summary", { p_year: year }), "summary")[0];
    const dash = await get("/fr/dashboard", "dirA");
    const tile = (html, name) => digits(attr(html, new RegExp(`data-dashboard-tile="${name}" data-value="([^"]*)"`)));
    check(label("director's dashboard: 'Encaissé ce mois' and 'Impayés à date' = fee_summary"),
      tile(dash.body, "collected") === digits(String(summary.collected_month_centimes)).padStart(3, "0")
        && tile(dash.body, "unpaid") === digits(String(summary.unpaid_centimes)).padStart(3, "0") && dash.body.includes("Encaissé ce mois"),
      `${tile(dash.body, "collected")} / ${summary.collected_month_centimes}, ${tile(dash.body, "unpaid")} / ${summary.unpaid_centimes}`);
    const accDash = await get("/fr/dashboard", "accA");
    check(label("accountant's dashboard: only the two fees tiles (no counts card, no other tile)"),
      accDash.body.includes("data-fee-tiles") && accDash.body.includes('data-dashboard-tile="unpaid"') && !accDash.body.includes("data-dashboard-card")
        && !accDash.body.includes('data-dashboard-tile="absent"'));
    const survDash = await get("/fr/dashboard", "survA");
    check(label("surveillant's dashboard: no fees tiles"), survDash.status === 200 && !survDash.body.includes("data-fee-tiles"));

    // --- Module off ----------------------------------------------------------------------------------------
    must(await admin.from("school_modules").update({ enabled: false }).eq("school_id", A.id).eq("module_key", "fees"), "off");
    check(label("fees module off: CSV 403, no fees tiles on the dashboard"),
      (await get(`/fr/fees/export?report=unpaid&year=${year}`, "dirA")).status === 403 && !(await get("/fr/dashboard", "dirA")).body.includes("data-fee-tiles"));
    must(await admin.from("school_modules").update({ enabled: true }).eq("school_id", A.id).eq("module_key", "fees"), "on");
  } finally {
    // Payments, students, guardians, class, level and year stay with fixture school A (removed with it).
    if (currentBefore?.id !== year) {
      await admin.from("academic_years").update({ is_current: false }).eq("id", year);
      if (currentBefore) await admin.from("academic_years").update({ is_current: true }).eq("id", currentBefore.id);
    }
    await admin.from("school_modules").delete().in("school_id", [A.id, B.id]).eq("module_key", "fees");
  }
}
