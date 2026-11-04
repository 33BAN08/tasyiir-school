// Phase 13 step 8 pages, over HTTP as real users: /portal/fees and
// /print/my-receipts/[id]. Amounts and "Remise" in FR + AR, no secret in the
// HTML or the page payload, the copy is always a DUPLICATA without a stamp box
// and records no print (the staff's first print is still the Original), the home
// tile shows no amount, access (another parent 404, staff / student sent home,
// module off), English → the French receipt.
import { randomBytes, randomUUID } from "node:crypto";

import { sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";
import { randomMobile } from "./phase5-guardians.mjs";
import { resolveStreamed } from "./streamed-html.mjs";

const monthAdd = (month, n) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
};
const dayAdd = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export async function portalFeesPages({ fx, baseUrl }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const label = (s) => `[P13 portal fees] ${s}`;
  const must = (r, what) => {
    if (r.error) throw new Error(`portalFeesPages setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (q, what) => must(await q.select("id").single(), what).id;

  must(await admin.from("school_modules").upsert([
    { school_id: A.id, module_key: "fees", enabled: true },
    { school_id: B.id, module_key: "fees", enabled: true },
  ], { onConflict: "school_id,module_key" }), "fees module");
  const cookies = {};
  const account = async (key, school, role) => {
    const email = `rls-test+${fx.run}-pf${key}@example.com`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), key).user;
    fx.createdUserIds.push(user.id);
    must(await admin.from("profiles").insert({
      id: user.id, school_id: school.id, role_id: school.roles[role], full_name: `RLS pf${key}`, must_change_password: false,
    }), `${key} profile`);
    cookies[key] = await sessionCookies({ email, password });
    return user.id;
  };
  const parent = await account("par", A, "parent");
  const other = await account("oth", A, "parent");
  await account("stu", A, "student");
  await account("parb", B, "parent");
  for (const name of ["dirA", "tchA"]) cookies[name] = await sessionCookies(fx.users[name]);
  const dir = await signIn(fx.users.dirA);

  // The current year covers today: registration + 2 months due, next month not due.
  const today = must(await dir.rpc("school_clock").single(), "clock").local_date;
  const thisMonth = `${today.slice(0, 7)}-01`;
  const [past1, fut1] = [-1, 1].map((n) => monthAdd(thisMonth, n));
  const dueDay = Math.min(Number(today.slice(8, 10)), 28);
  const { data: covering } = await admin.from("academic_years").select("id, start_date, end_date").eq("school_id", A.id)
    .lte("start_date", today).gte("end_date", today).maybeSingle();
  if (covering && (covering.start_date > past1 || covering.end_date < monthAdd(fut1, 1))) {
    throw new Error("portalFeesPages setup: school A's year of today does not cover the test months");
  }
  const { data: before } = await admin.from("academic_years").select("id").eq("school_id", A.id).eq("is_current", true).maybeSingle();
  const year = covering?.id ?? await id(admin.from("academic_years").insert({
    school_id: A.id, label: `PG-${fx.run}`, start_date: monthAdd(thisMonth, -3), end_date: dayAdd(monthAdd(thisMonth, 5), -1), is_current: false,
  }), "year");
  if (before && before.id !== year) must(await admin.from("academic_years").update({ is_current: false }).eq("id", before.id), "old current off");
  must(await admin.from("academic_years").update({ is_current: true }).eq("id", year), "current year");
  must(await admin.from("fee_years").upsert({ school_id: A.id, academic_year_id: year, billing_months: [past1, thisMonth, fut1], due_day: dueDay }), "fee year");
  const level = await id(admin.from("levels").insert({ school_id: A.id, cycle: "college", name: `PG ${fx.run}` }), "level");
  const cls = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name: `PG-1 ${fx.run}` }), "class");
  const massar = `Q${String(parseInt(fx.run, 16) % 1e9).padStart(9, "0")}`;
  const newStudent = async (first, firstAr, code) => {
    const sid = await id(admin.from("students").insert({
      school_id: A.id, first_name: first, last_name: `PG ${fx.run}`, first_name_ar: firstAr, last_name_ar: "بنعلي", birth_date: "2014-01-01", gender: "male", code_massar: code,
    }), first);
    must(await admin.from("student_enrollments").insert({ school_id: A.id, student_id: sid, academic_year_id: year, class_id: cls }), `${first} enrolled`);
    return sid;
  };
  const kid = await newStudent("Yassine", "ياسين", massar);
  const unpaidKid = await newStudent("Nora", "نورة", null);
  // Linked to the parent but enrolled in no year: no charge, no fee data.
  const nofees = await id(admin.from("students").insert({
    school_id: A.id, first_name: "Lina", last_name: `PG ${fx.run}`, birth_date: "2014-01-01", gender: "female",
  }), "Lina");
  const strangerKid = await newStudent("Tarik", "طارق", null);
  const guardian = async (profile, sid, tag) => {
    const g = await id(admin.from("guardians").insert({
      school_id: A.id, last_name: `PG ${tag}`, first_name: "Parent", phone: randomMobile(), profile_id: profile,
    }), `guardian ${tag}`);
    must(await admin.from("student_guardians").insert({ school_id: A.id, student_id: sid, guardian_id: g, relation: "father" }), `link ${tag}`);
    return g;
  };
  const g = await guardian(parent, kid, "par");
  must(await admin.from("student_guardians").insert({ school_id: A.id, student_id: unpaidKid, guardian_id: g, relation: "father" }), "link 2");
  await guardian(other, strangerKid, "oth");
  must(await dir.rpc("save_fee_plans", { p_year: year, p_rows: [{ level_id: level, registration_centimes: 50000, monthly_centimes: 100000 }] }), "plan");
  must(await admin.from("student_guardians").insert({ school_id: A.id, student_id: nofees, guardian_id: g, relation: "father" }), "link 3");

  const SECRET_REASON = `SECRET-DISCOUNT-${fx.run}`;
  must(await dir.from("student_discounts").insert({
    school_id: A.id, academic_year_id: year, student_id: kid, kind: "scholarship", percent_bp: 2000, applies_to: "tuition", reason: SECRET_REASON }), "discount");
  const SECRETS = {
    note: `SECRET-NOTE-${fx.run}`, payer: `SECRET-PAYER-${fx.run}`, bank: `SECRET-BANK-${fx.run}`, ref: `SECRET-REF-${fx.run}`,
    cancel: `SECRET-CANCEL-${fx.run}`, charge: `SECRET-CHARGE-${fx.run}`, discount: SECRET_REASON, staff: "RLS dirA",
  };
  const pay = async (values) => must(await dir.rpc("record_payment", {
    p_student: kid, p_year: year, p_method: "cash", p_paid_on: today, p_idempotency_key: randomUUID(), ...values,
  }).single(), "payment");
  // 500 registration + 800 month −1 + 100 of this month's 800.
  const valid = await pay({ p_amount: 140000, p_method: "cheque", p_bank: SECRETS.bank, p_reference: SECRETS.ref, p_payer_name: SECRETS.payer, p_note: SECRETS.note });
  const voided = await pay({ p_amount: 5000, p_note: SECRETS.note });
  must(await dir.rpc("cancel_payment", { p_payment: voided.payment_id, p_reason: "other", p_note: SECRETS.cancel }), "cancel");
  const { data: nextCharge } = await admin.from("student_charges").select("id").eq("student_id", kid).eq("academic_year_id", year).eq("kind", "tuition").eq("month", fut1).single();
  must(await dir.rpc("cancel_charge", { p_charge: nextCharge.id, p_reason: "other", p_note: SECRETS.charge }), "cancel charge");

  const get = async (path, who) => {
    const res = await fetch(new URL(path, baseUrl), { headers: { cookie: cookies[who] }, redirect: "manual" });
    const html = res.status === 200 ? resolveStreamed(await res.text()) : "";
    return { status: res.status, html, location: res.headers.get("location") ?? "" };
  };
  const plain = (html) => html.replace(/[⁦-⁩]/g, "").replace(/[  ]/g, " ");
  const notFound = (r) => r.status === 404 || r.html.includes("NEXT_HTTP_ERROR_FALLBACK;404");
  const sentAway = (r) => [302, 303, 307, 308].includes(r.status) || r.html.includes("NEXT_REDIRECT");
  const attr = (html, name, value, other) => new RegExp(`${name}="${value}"[^>]*${other}="([^"]*)"|${other}="([^"]*)"[^>]*${name}="${value}"`).exec(html)?.slice(1).find(Boolean);
  const printsOf = async (payment) => ((await admin.from("receipt_prints").select("id").eq("payment_id", payment)).data ?? []).length;
  const noSecret = (where, html) => {
    for (const [name, secret] of Object.entries(SECRETS)) {
      check(label(`${where}: no ${name} anywhere in the page or its payload`), !html.includes(secret));
    }
  };
  const PAGE = (locale, child, extra = "") => `/${locale}/portal/fees?child=${child}${extra}`;
  const PRINT = (locale, payment) => `/${locale}/print/my-receipts/${payment}`;

  try {
    // --- The page -----------------------------------------------------------------------------------------
    const fr = await get(PAGE("fr", kid), "par");
    check(label("the parent opens the child's page"), fr.status === 200 && fr.html.includes(`data-parent-fees="${kid}"`), `${fr.status}`);
    const fact = (html, key) => Number(attr(html, "data-fee-fact", key, "data-amount"));
    // 500 + 800 + 800 + (next month cancelled) = 2100; paid 1400; left 700.
    check(label("totals: year 2100 DH, paid 1400, left 700, due to date 700"),
      fact(fr.html, "total") === 210000 && fact(fr.html, "paid") === 140000 && fact(fr.html, "balance") === 70000 && fact(fr.html, "due") === 70000,
      JSON.stringify(["total", "paid", "balance", "due"].map((k) => fact(fr.html, k))));
    const frText = plain(fr.html);
    check(label("…amounts in French format"), frText.includes("2 100,00 DH") && frText.includes("1 400,00 DH"), "");
    const state = (html, key) => attr(html, "data-month", key, "data-month-state");
    check(label("months: registration paid, last month paid, this month partial, next month cancelled"),
      state(fr.html, "registration") === "paid" && state(fr.html, past1) === "paid" && state(fr.html, thisMonth) === "partial" && state(fr.html, fut1) === "cancelled",
      JSON.stringify(["registration", past1, thisMonth, fut1].map((k) => state(fr.html, k))));
    check(label("a month shows its net and its Remise amount"),
      attr(fr.html, "data-month", thisMonth, "data-month-net") === "80000" && attr(fr.html, "data-month", thisMonth, "data-month-discount") === "20000" && frText.includes("Remise 200,00 DH"),
      JSON.stringify([attr(fr.html, "data-month", thisMonth, "data-month-net"), attr(fr.html, "data-month", thisMonth, "data-month-discount")]));
    check(label("a cancelled month: no amount, no Remise"),
      attr(fr.html, "data-month", fut1, "data-month-net") === undefined && attr(fr.html, "data-month", fut1, "data-month-discount") === undefined, "");
    check(label("no Remise on the registration (the discount is on tuition)"), attr(fr.html, "data-month", "registration", "data-month-discount") === undefined, "");
    check(label("receipts: the valid one can be printed, the cancelled one is listed without a print link"),
      attr(fr.html, "data-receipt-row", valid.payment_id, "data-receipt-state") === "valid" && attr(fr.html, "data-receipt-row", voided.payment_id, "data-receipt-state") === "cancelled"
        && fr.html.includes(`/fr/print/my-receipts/${valid.payment_id}`) && !fr.html.includes(`/print/my-receipts/${voided.payment_id}`), "");
    check(label("…the receipt label is shown"), fr.html.includes(valid.receipt_label), valid.receipt_label);
    noSecret("French page", fr.html);

    const ar = await get(PAGE("ar", kid), "par");
    const arText = plain(ar.html);
    check(label("Arabic page: rtl, same totals, Remise in Arabic"),
      ar.status === 200 && /<html[^>]*dir="rtl"/.test(ar.html) && fact(ar.html, "total") === 210000 && arText.includes("تخفيض 200,00 DH"), `${ar.status}`);
    noSecret("Arabic page", ar.html);

    // --- Which child, which year -----------------------------------------------------------------------------
    const wrong = await get(PAGE("fr", strangerKid), "par");
    check(label("another parent's child in the URL: falls back to their own, nothing of that child"),
      wrong.status === 200 && !wrong.html.includes(`data-parent-fees="${strangerKid}"`) && !wrong.html.includes("Tarik"), "");
    const empty = await get(PAGE("fr", nofees), "par");
    check(label("a child with no fee data: an empty state, no figures"), empty.status === 200 && !empty.html.includes("data-fee-totals"), "");
    const sibling = await get(PAGE("fr", unpaidKid), "par");
    check(label("the other child: their own figures, nothing paid"), fact(sibling.html, "paid") === 0 && fact(sibling.html, "due") > 0, "");

    // --- Home tile: no amount ------------------------------------------------------------------------------
    const tile = (html) => /data-home-tile="fees"[^>]*>([\s\S]*?)<\/a>/.exec(html)?.[1] ?? "";
    const home = await get(`/fr/portal?child=${kid}`, "par");
    check(label("home tile: 'Montant à régler', no amount"),
      home.html.includes(`data-home-tile="fees"`) && plain(tile(home.html)).includes("Montant à régler") && !/\d\s?DH|\d,\d\d/.test(plain(tile(home.html))), plain(tile(home.html)).slice(0, 200));
    const homeEmpty = await get(`/fr/portal?child=${nofees}`, "par");
    check(label("home tile: none for a child with no fee data"), homeEmpty.status === 200 && !homeEmpty.html.includes(`data-home-tile="fees"`), "");

    // --- The receipt: always a DUPLICATA, no print recorded, no stamp box ----------------------------------------
    const copy = await get(PRINT("fr", valid.payment_id), "par");
    check(label("receipt: opens, DUPLICATA, French, the parent-copy line instead of the stamp box"),
      copy.status === 200 && copy.html.includes(`data-receipt-copy="duplicate"`) && copy.html.includes(`data-receipt-language="fr"`)
        && copy.html.includes("data-receipt-parent-copy") && !copy.html.includes("data-receipt-stamp"), `${copy.status}`);
    const copyText = plain(copy.html);
    check(label("…label, method, date, amount in figures and words, months, child, Massar code"),
      copyText.includes(valid.receipt_label) && copyText.includes("Chèque") && copyText.includes("1 400,00 DH") && copyText.includes("mille quatre cents dirhams")
        && copyText.includes("Inscription") && copyText.includes("Yassine") && copyText.includes(massar), "");
    noSecret("the parent's receipt", copy.html);
    check(label("…no 'Reçu par', payer, bank or cheque number row is rendered"), !/<dt[^>]*>(Reçu par|Payé par|Note)<\/dt>/.test(copy.html) && !/chèque n° (?!{value})/.test(copyText), "");
    const arCopy = await get(PRINT("ar", valid.payment_id), "par");
    noSecret("the parent's receipt in Arabic", arCopy.html);
    check(label("Arabic receipt: Arabic, DUPLICATA, words in Arabic"),
      arCopy.html.includes(`data-receipt-language="ar"`) && arCopy.html.includes(`data-receipt-copy="duplicate"`) && plain(arCopy.html).includes("فقط لا غير"), "");
    check(label("the language switch points to the same parent page"), copy.html.includes(`/ar/print/my-receipts/${valid.payment_id}`) && copy.html.includes(`data-receipt-switch="ar"`), "");
    const en = await get(PRINT("en", valid.payment_id), "par");
    check(label("English → the French receipt"), (sentAway(en) && (en.location + en.html).includes(`/fr/print/my-receipts/${valid.payment_id}`)), `${en.status} ${en.location}`);
    check(label("the parent's openings recorded no print"), await printsOf(valid.payment_id) === 0, String(await printsOf(valid.payment_id)));
    const staffFirst = await get(`/fr/print/receipts/${valid.payment_id}`, "dirA");
    check(label("after all that, the school's first print is still the ORIGINAL"),
      staffFirst.status === 200 && staffFirst.html.includes(`data-receipt-copy="original"`) && await printsOf(valid.payment_id) === 1, `${staffFirst.status}`);
    check(label("…and the staff sheet still has its stamp box and full fields"),
      staffFirst.html.includes("data-receipt-stamp") && staffFirst.html.includes(SECRETS.payer) && staffFirst.html.includes(SECRETS.bank), "");
    const afterStaff = await get(PRINT("fr", valid.payment_id), "par");
    check(label("the parent's copy afterwards: still DUPLICATA, still no second print"),
      afterStaff.html.includes(`data-receipt-copy="duplicate"`) && await printsOf(valid.payment_id) === 1, "");

    // --- Access ---------------------------------------------------------------------------------------------
    check(label("a cancelled receipt → 404"), notFound(await get(PRINT("fr", voided.payment_id), "par")));
    check(label("an unknown id → 404"), notFound(await get(PRINT("fr", randomUUID()), "par")));
    check(label("not a uuid → 404"), notFound(await get(PRINT("fr", "not-a-uuid"), "par")));
    check(label("another parent of the school → 404"), notFound(await get(PRINT("fr", valid.payment_id), "oth")));
    check(label("a parent of school B → 404"), notFound(await get(PRINT("fr", valid.payment_id), "parb")));
    for (const who of ["dirA", "tchA", "stu"]) {
      const r = await get(PRINT("fr", valid.payment_id), who);
      check(label(`${who} on the parent's receipt page → sent home`), sentAway(r) && !r.html.includes("data-receipt-sheet"), `${r.status}`);
    }
    const staffPage = await get(`/fr/print/receipts/${valid.payment_id}`, "par");
    check(label("a parent on the staff receipt page → sent home, no print recorded"), sentAway(staffPage) && await printsOf(valid.payment_id) === 1, `${staffPage.status}`);
    const stuPage = await get("/fr/portal/fees", "stu");
    check(label("a student on /portal/fees → sent home"), sentAway(stuPage), `${stuPage.status}`);
    const dirPage = await get(PAGE("fr", kid), "dirA");
    check(label("a director on /portal/fees → sent away"), sentAway(dirPage) && !dirPage.html.includes("data-fee-totals"), `${dirPage.status}`);

    // --- Module off ----------------------------------------------------------------------------------------------
    must(await admin.from("school_modules").update({ enabled: false }).eq("school_id", A.id).eq("module_key", "fees"), "module off");
    try {
      const off = await get(PAGE("fr", kid), "par");
      check(label("module off: the page says so, no figures"), off.status === 200 && !off.html.includes("data-fee-totals"), `${off.status}`);
      const offHome = await get(`/fr/portal?child=${kid}`, "par");
      check(label("module off: no home tile"), !offHome.html.includes(`data-home-tile="fees"`), "");
      const offPrint = await get(PRINT("fr", valid.payment_id), "par");
      check(label("module off: the receipt sends home"), sentAway(offPrint) && !offPrint.html.includes("data-receipt-sheet"), `${offPrint.status}`);
    } finally {
      must(await admin.from("school_modules").update({ enabled: true }).eq("school_id", A.id).eq("module_key", "fees"), "module on");
    }
  } finally {
    // A suite that makes its own year current puts the previous one back.
    if (before && before.id !== year) {
      must(await admin.from("academic_years").update({ is_current: false }).eq("id", year), "this year off");
      must(await admin.from("academic_years").update({ is_current: true }).eq("id", before.id), "previous year back");
    } else if (!before) {
      must(await admin.from("academic_years").update({ is_current: false }).eq("id", year), "this year off");
    }
  }
}
