// Phase 13 step 5b page: the receipt print page /[locale]/print/receipts/[id],
// fetched over HTTP as real users. The first opening is the ORIGINAL; every
// later opening is a DUPLICATA — except the FR ⇄ AR switch (?print=<that
// print>), which re-uses its print and records nothing (same person; another
// person's or another payment's print id records a new one; the 10-minute
// limit is checked in rules-receipt.mjs). Amount in words in both languages,
// the ANNULÉ / ملغى band, access (other school 404, no fees.view or module off
// → sent home, nothing recorded), English → the French receipt, and the
// student page's "Imprimer" links with "reçu par" for the accountant.
import { randomBytes, randomUUID } from "node:crypto";

import { sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";

export async function receiptPrintPages({ fx, baseUrl }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const label = (s) => `[P13 receipt page] ${s}`;
  const must = (r, what) => {
    if (r.error) throw new Error(`receiptPrintPages setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (q, what) => must(await q.select("id").single(), what).id;

  must(await admin.from("school_modules").insert([
    { school_id: A.id, module_key: "fees", enabled: true },
    { school_id: B.id, module_key: "fees", enabled: true },
  ]), "fees module");
  const email = `rls-test+${fx.run}-rpacc@example.com`;
  const password = `${randomBytes(12).toString("base64url")}a1`;
  const accUser = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), "accountant").user;
  fx.createdUserIds.push(accUser.id);
  must(await admin.from("profiles").insert({
    id: accUser.id, school_id: A.id, role_id: A.roles.accountant, full_name: "RLS rpacc", must_change_password: false,
  }), "accountant profile");
  const cookies = { accA: await sessionCookies({ email, password }) };
  for (const name of ["dirA", "survA", "tchA", "dirB"]) cookies[name] = await sessionCookies(fx.users[name]);
  const dir = await signIn(fx.users.dirA);

  const { data: before } = await admin.from("academic_years").select("id").eq("school_id", A.id).eq("is_current", true).maybeSingle();
  const year = await id(admin.from("academic_years").insert({
    school_id: A.id, label: `RP-${fx.run}`, start_date: "2082-09-01", end_date: "2083-06-30", is_current: false,
  }), "year");
  if (before) must(await admin.from("academic_years").update({ is_current: false }).eq("id", before.id), "old current off");
  must(await admin.from("academic_years").update({ is_current: true }).eq("id", year), "current year");
  must(await admin.from("fee_years").insert({ school_id: A.id, academic_year_id: year, billing_months: ["2082-09-01", "2082-10-01"], due_day: 5, receipt_prefix: "RP" }), "fee year");
  const level = await id(admin.from("levels").insert({ school_id: A.id, cycle: "college", name: `RP ${fx.run}` }), "level");
  const cls = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name: `RP-1 ${fx.run}` }), "class");
  const student = await id(admin.from("students").insert({
    school_id: A.id, first_name: "Yassine", last_name: `RP ${fx.run}`, first_name_ar: "ياسين", last_name_ar: "بنعلي",
    birth_date: "2014-01-01", gender: "male", code_massar: `R${String(parseInt(fx.run, 16) % 1e9).padStart(9, "0")}`,
  }), "student");
  must(await admin.from("student_enrollments").insert({ school_id: A.id, student_id: student, academic_year_id: year, class_id: cls }), "enroll");
  must(await dir.rpc("save_fee_plans", { p_year: year, p_rows: [{ level_id: level, registration_centimes: 100000, monthly_centimes: 125050 }] }), "plan");
  const today = must(await dir.rpc("school_clock").single(), "clock").local_date;
  const pay = async (values) => must(await dir.rpc("record_payment", {
    p_student: student, p_year: year, p_method: "cash", p_paid_on: today, p_idempotency_key: randomUUID(), ...values,
  }).single(), "payment").payment_id;
  const p1 = await pay({ p_amount: 125050, p_payer_name: "Karim" });
  const p2 = await pay({ p_amount: 20000, p_method: "cheque", p_bank: "CIH", p_reference: "445566" });
  must(await dir.rpc("cancel_payment", { p_payment: p2, p_reason: "bounced_cheque" }), "cancel p2");

  const get = async (path, who) => {
    const res = await fetch(new URL(path, baseUrl), { headers: { cookie: cookies[who] }, redirect: "manual" });
    const html = res.status === 200 ? await res.text() : "";
    return { status: res.status, html, location: res.headers.get("location") ?? "" };
  };
  const plain = (html) => html.replace(/[⁦-⁩]/g, "").replace(/ /g, " ");
  const copy = (html) => /data-receipt-copy="(\w+)"/.exec(html)?.[1];
  const printId = (html) => /data-print-id="([0-9a-f-]{36})"/.exec(html)?.[1];
  const prints = async (payment) => (await admin.from("receipt_prints").select("print_no, language, printed_by").eq("payment_id", payment).order("print_no")).data ?? [];
  const notFound = (r) => r.status === 404 || r.html.includes("NEXT_HTTP_ERROR_FALLBACK;404");
  const sentAway = (r) => [302, 303, 307, 308].includes(r.status) || r.html.includes("NEXT_REDIRECT");
  const PAGE = (locale, payment, print) => `/${locale}/print/receipts/${payment}${print ? `?print=${print}` : ""}`;

  try {
    // --- Original, then the language switch ---------------------------------------------------------------
    const first = await get(PAGE("fr", p1), "accA");
    const pid = printId(first.html);
    check(label("accountant opens the receipt: ORIGINAL, French, one print recorded"),
      first.status === 200 && copy(first.html) === "original" && first.html.includes(`data-receipt-language="fr"`) && !!pid
        && (await prints(p1)).length === 1, `${first.status} ${copy(first.html)}`);
    const fr = plain(first.html);
    check(label("…amount in figures and in French words, receipt label, payer, 'Reçu par' the director"),
      fr.includes("1 250,50 DH") && fr.includes("mille deux cent cinquante dirhams et cinquante centimes") && fr.includes("RP-RP-")
        && fr.includes("Karim") && fr.includes("RLS dirA"), "");
    check(label("…the switch link carries this print"), first.html.includes(`print=${pid}`));
    // The number exactly as stored (no spaces around the hyphen: proportional figures), then the copy label.
    const stored = (await admin.from("payments").select("receipt_label").eq("id", p1).single()).data?.receipt_label;
    const number = (html) => /<span[^>]*class="([^"]*)"[^>]*data-receipt-no="[^"]*">([^<]*)<\/span><span[^>]*data-receipt-copy-label="[^"]*">([^<]*)</.exec(html);
    const numberFr = number(first.html);
    check(label("…the receipt number exactly as stored (no spaces), proportional figures, 'Original' next to it"),
      !!stored && !/\s/.test(stored) && stored.endsWith("/000001") && numberFr?.[2] === stored && /\bfont-code\b/.test(numberFr[1])
        && !/\bfont-numeric\b/.test(numberFr[1]) && numberFr[3] === "Original", JSON.stringify([stored, numberFr?.slice(1)]));
    const ar = await get(PAGE("ar", p1, pid), "accA");
    const numberAr = number(ar.html);
    check(label("…in Arabic too: the same stored number, 'أصل' next to it"),
      numberAr?.[2] === stored && /\bfont-code\b/.test(numberAr[1]) && numberAr[3] === "أصل", JSON.stringify(numberAr?.slice(1)));
    check(label("LANGUAGE SWITCH to Arabic: still ORIGINAL, and still exactly one print"),
      copy(ar.html) === "original" && ar.html.includes(`data-receipt-language="ar"`) && printId(ar.html) === pid
        && (await prints(p1)).length === 1, `${copy(ar.html)} ${(await prints(p1)).length} print(s)`);
    check(label("…Arabic words ending with 'فقط لا غير'"),
      plain(ar.html).includes("ألف ومائتان وخمسون درهما وخمسون سنتيما فقط لا غير"));
    const back = await get(PAGE("fr", p1, pid), "accA");
    check(label("…and back to French: ORIGINAL, still one print"), copy(back.html) === "original" && (await prints(p1)).length === 1);

    // --- Every other opening: DUPLICATA --------------------------------------------------------------------
    const other = await get(PAGE("ar", p1, pid), "dirA");
    let list = await prints(p1);
    check(label("another person with the same print id → a new print, DUPLICATA (Arabic stored)"),
      copy(other.html) === "duplicate" && list.length === 2 && list[1].language === "ar" && list[1].printed_by === fx.users.dirA.id,
      `${copy(other.html)} ${JSON.stringify(list)}`);
    const reload = await get(PAGE("fr", p1), "accA");
    check(label("the accountant opens it again (no print id) → DUPLICATA, 3 prints"),
      copy(reload.html) === "duplicate" && (await prints(p1)).length === 3);
    check(label("…'DUPLICATA' as the label next to the number"), number(reload.html)?.[3] === "DUPLICATA" && number(reload.html)?.[2] === stored);
    const garbage = await get(PAGE("fr", p1, "not-a-uuid"), "accA");
    check(label("a print id that is not a uuid → a new print"), copy(garbage.html) === "duplicate" && (await prints(p1)).length === 4);
    const wrongPayment = await get(PAGE("fr", p2, pid), "accA");
    list = await prints(p2);
    check(label("another payment's print id → that receipt's own first print (ORIGINAL), nothing added to the first"),
      copy(wrongPayment.html) === "original" && list.length === 1 && (await prints(p1)).length === 4);

    // --- Cancelled receipt ---------------------------------------------------------------------------------
    check(label("a cancelled receipt prints with the ANNULÉ band and the reason"),
      wrongPayment.html.includes("data-receipt-cancelled") && plain(wrongPayment.html).includes("ANNULÉ")
        && plain(wrongPayment.html).includes("Chèque impayé") && plain(wrongPayment.html).includes("chèque n° 445566"));
    const cancelledAt = (await admin.from("payments").select("cancelled_at").eq("id", p2).single()).data.cancelled_at;
    const local = must(await dir.rpc("school_clock", { p_at: cancelledAt }).single(), "clock at");
    const [cy, cm, cd] = local.local_date.split("-");
    check(label("…cancelled 'le dd/MM/yyyy HH:MM' in the school's time from the database (not Node's)"),
      plain(wrongPayment.html).includes(`le ${cd}/${cm}/${cy} ${local.local_time}`), `${local.local_date} ${local.local_time}`);
    const cancelledAr = await get(PAGE("ar", p2, printId(wrongPayment.html)), "accA");
    check(label("…in Arabic: ملغى"), cancelledAr.html.includes("data-receipt-cancelled") && plain(cancelledAr.html).includes("ملغى"));

    // --- Access --------------------------------------------------------------------------------------------
    const count = (await prints(p1)).length;
    check(label("director of B: A's receipt → not found"), notFound(await get(PAGE("fr", p1), "dirB")));
    check(label("teacher → sent home"), sentAway(await get(PAGE("fr", p1), "tchA")));
    check(label("surveillant (no fees.view) → sent home"), sentAway(await get(PAGE("fr", p1), "survA")));
    must(await admin.from("school_modules").update({ enabled: false }).eq("school_id", A.id).eq("module_key", "fees"), "off");
    check(label("fees module off → sent home"), sentAway(await get(PAGE("fr", p1), "accA")));
    must(await admin.from("school_modules").update({ enabled: true }).eq("school_id", A.id).eq("module_key", "fees"), "on");
    check(label("…none of these recorded a print"), (await prints(p1)).length === count, `${(await prints(p1)).length} vs ${count}`);
    check(label("an unknown receipt id → not found"), notFound(await get(PAGE("fr", randomUUID()), "accA")));
    const en = await get(PAGE("en", p1, pid), "accA");
    check(label("English → the French receipt (print id kept), nothing recorded"),
      sentAway(en) && (en.location.includes(`/fr/print/receipts/${p1}`) || en.html.includes(`/fr/print/receipts/${p1}`))
        && (await prints(p1)).length === count, `${en.status} ${en.location}`);

    // --- Student page: print links, names for the accountant -----------------------------------------------------
    const studentPage = plain((await get(`/fr/students/${student}`, "accA")).html);
    check(label("student page: an 'Imprimer' link per receipt, opening the print page"),
      (studentPage.match(/data-payment-print/g) ?? []).length >= 2 && studentPage.includes(`/fr/print/receipts/${p1}`));
    check(label("student page: the accountant sees 'reçu par' the director (fee_staff_names)"), studentPage.includes("reçu par RLS dirA"));
    const text = studentPage.replace(/<[^>]+>/g, "");
    check(label("…and who cancelled ('Annulé : Chèque impayé · RLS dirA')"), text.includes("Annulé : Chèque impayé · RLS dirA"),
      /Annulé : [^\n]{0,60}/.exec(text)?.[0] ?? "");
  } finally {
    await admin.from("academic_years").update({ is_current: false }).eq("id", year);
    if (before) await admin.from("academic_years").update({ is_current: true }).eq("id", before.id);
    await admin.from("school_modules").delete().in("school_id", [A.id, B.id]).eq("module_key", "fees");
    // Payments and prints stay with fixture school A.
  }
}
