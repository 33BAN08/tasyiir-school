// Browser sweep, Phase 13 step 8 (parent fees): headless Chrome over CDP, fixture schools only,
// AR + FR, 390 + 1366 px, on DEV through the local build.
// Start the build first (node node_modules/next/dist/bin/next start -p 3100), then from the project root:
//   node --env-file=.env.local scripts/browser/parent-fees.mjs
// Screenshots + PDFs go to a new temp folder, printed at the start. CHROME_PATH overrides the Chrome location.
import "../rls/guard.mjs";

import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sessionCookies } from "../rls/app.mjs";
import { admin, createFixtures, removeFixtures, signIn } from "../rls/fixtures.mjs";
import { randomMobile } from "../rls/phase5-guardians.mjs";

const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SHOTS = mkdtempSync(join(tmpdir(), "madar-browser-"));
const PROFILE = join(SHOTS, "chrome-profile");
console.log(`Screenshots: ${SHOTS}`);
const BASE = process.env.TEST_APP_URL ?? "http://localhost:3100";
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && detail ? ` :: ${detail}` : ""}`); };
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.code ?? r.error.message}`); return r.data; };
const id = async (q, what) => must(await q.select("id").single(), what).id;
const monthAdd = (month, n) => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10); };
const dayAdd = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const fx = await createFixtures();
let chrome;
try {
  const A = fx.schools.a;
  must(await admin.from("school_modules").upsert([{ school_id: A.id, module_key: "fees", enabled: true }], { onConflict: "school_id,module_key" }), "module");
  const email = `rls-test+${fx.run}-bpar@example.com`;
  const password = `${randomBytes(12).toString("base64url")}a1`;
  const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), "parent").user;
  fx.createdUserIds.push(user.id);
  must(await admin.from("profiles").insert({ id: user.id, school_id: A.id, role_id: A.roles.parent, full_name: "Parent Test", must_change_password: false }), "profile");
  const dir = await signIn(fx.users.dirA);
  const today = must(await dir.rpc("school_clock").single(), "clock").local_date;
  const thisMonth = `${today.slice(0, 7)}-01`;
  const months = [-2, -1, 0, 1, 2, 3].map((n) => monthAdd(thisMonth, n));
  const dueDay = Math.min(Number(today.slice(8, 10)), 28);
  const { data: covering } = await admin.from("academic_years").select("id").eq("school_id", A.id).lte("start_date", today).gte("end_date", today).maybeSingle();
  const { data: before } = await admin.from("academic_years").select("id").eq("school_id", A.id).eq("is_current", true).maybeSingle();
  const year = covering?.id ?? await id(admin.from("academic_years").insert({ school_id: A.id, label: "2026-2027", start_date: monthAdd(thisMonth, -3), end_date: dayAdd(monthAdd(thisMonth, 5), -1), is_current: false }), "year");
  if (before && before.id !== year) must(await admin.from("academic_years").update({ is_current: false }).eq("id", before.id), "off");
  must(await admin.from("academic_years").update({ is_current: true }).eq("id", year), "current");
  must(await admin.from("fee_years").upsert({ school_id: A.id, academic_year_id: year, billing_months: months, due_day: dueDay, receipt_prefix: "MDR" }), "fee year");
  const pastYear = await id(admin.from("academic_years").insert({ school_id: A.id, label: "2020-2021", start_date: "2020-09-01", end_date: "2021-06-30", is_current: false }), "past year");
  const level = await id(admin.from("levels").insert({ school_id: A.id, cycle: "college", name: `Brw ${fx.run}` }), "level");
  const cls = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name: "3AC-1" }), "class");
  const clsOld = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: pastYear, level_id: level, name: "6AP-1" }), "old class");
  const kid = await id(admin.from("students").insert({ school_id: A.id, first_name: "Yassine", last_name: "Bennani", first_name_ar: "ياسين", last_name_ar: "بناني", birth_date: "2014-01-01", gender: "male", code_massar: "R130045678" }), "kid");
  const kid2 = await id(admin.from("students").insert({ school_id: A.id, first_name: "Nora", last_name: "Bennani", first_name_ar: "نورة", last_name_ar: "بناني", birth_date: "2016-01-01", gender: "female" }), "kid2");
  for (const s of [kid, kid2]) must(await admin.from("student_enrollments").insert({ school_id: A.id, student_id: s, academic_year_id: year, class_id: cls }), "enroll");
  must(await admin.from("student_enrollments").insert({ school_id: A.id, student_id: kid, academic_year_id: pastYear, class_id: clsOld }), "enroll old");
  const g = await id(admin.from("guardians").insert({ school_id: A.id, last_name: "Bennani", first_name: "Parent", phone: randomMobile(), profile_id: user.id }), "guardian");
  for (const s of [kid, kid2]) must(await admin.from("student_guardians").insert({ school_id: A.id, student_id: s, guardian_id: g, relation: "father" }), "link");
  must(await dir.rpc("save_fee_plans", { p_year: year, p_rows: [{ level_id: level, registration_centimes: 150000, monthly_centimes: 125050 }] }), "plan");
  must(await dir.rpc("save_fee_plans", { p_year: pastYear, p_rows: [{ level_id: level, registration_centimes: 90000, monthly_centimes: null }] }), "old plan");
  const bus = await id(admin.from("fee_services").insert({ school_id: A.id, academic_year_id: year, name: "Transport", name_ar: "النقل المدرسي", monthly_centimes: 30000 }), "bus");
  must(await dir.from("student_services").insert({ school_id: A.id, academic_year_id: year, student_id: kid, service_id: bus, from_month: months[1], to_month: null }), "subscribe");
  must(await dir.from("student_discounts").insert({ school_id: A.id, academic_year_id: year, student_id: kid, kind: "sibling", percent_bp: 1000, applies_to: "tuition", reason: "SECRET-REASON" }), "discount");
  const pay = async (values) => must(await dir.rpc("record_payment", { p_student: kid, p_year: year, p_method: "cash", p_paid_on: today, p_idempotency_key: randomUUID(), ...values }).single(), "pay");
  const p1 = await pay({ p_amount: 300000, p_method: "cheque", p_bank: "SECRET-BANK", p_reference: "SECRET-REF", p_payer_name: "SECRET-PAYER", p_note: "SECRET-NOTE" });
  await pay({ p_amount: 20000 });
  const voided = await pay({ p_amount: 10000 });
  must(await dir.rpc("cancel_payment", { p_payment: voided.payment_id, p_reason: "other", p_note: "SECRET-CANCEL" }), "cancel");
  const { data: lastCharge } = await admin.from("student_charges").select("id").eq("student_id", kid).eq("academic_year_id", year).eq("month", months[5]).eq("kind", "tuition").single();
  must(await dir.rpc("cancel_charge", { p_charge: lastCharge.id, p_reason: "other", p_note: "SECRET-CHARGE" }), "cancel charge");
  const { data: lastBus } = await admin.from("student_charges").select("id").eq("student_id", kid).eq("academic_year_id", year).eq("month", months[5]).eq("kind", "service").single();
  must(await dir.rpc("cancel_charge", { p_charge: lastBus.id, p_reason: "other", p_note: "SECRET-CHARGE" }), "cancel charge 2");

  const cookieHeader = await sessionCookies({ email, password });

  // --- Chrome --------------------------------------------------------------------------------------------
  chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9333", `--user-data-dir=${PROFILE}`, "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
  let target;
  for (let i = 0; i < 40 && !target; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    try { target = (await (await fetch("http://127.0.0.1:9333/json")).json()).find((t) => t.type === "page"); } catch { /* not up yet */ }
  }
  if (!target) throw new Error("chrome did not start");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, e) => { ws.onopen = r; ws.onerror = e; });
  let seq = 0;
  const pending = new Map();
  const consoleErrors = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
    if (d.method === "Runtime.exceptionThrown") consoleErrors.push(d.params.exceptionDetails.text);
    if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") consoleErrors.push(d.params.args.map((a) => a.value ?? a.description).join(" "));
    if (d.method === "Log.entryAdded" && d.params.entry.level === "error") consoleErrors.push(`${d.params.entry.text} ${d.params.entry.url ?? ""}`);
  };
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++seq;
    pending.set(n, (d) => (d.error ? reject(new Error(`${method}: ${d.error.message}`)) : resolve(d.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  for (const domain of ["Page", "Runtime", "Log", "Network"]) await cdp(`${domain}.enable`);
  for (const part of cookieHeader.split("; ")) {
    const at = part.indexOf("=");
    await cdp("Network.setCookie", { name: part.slice(0, at), value: part.slice(at + 1), url: BASE, path: "/" });
  }
  const evaluate = async (expression) => (await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
  const go = async (path, width) => {
    await cdp("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 900, deviceScaleFactor: 1, mobile: width === 390 });
    await cdp("Page.navigate", { url: `${BASE}${path}` });
    for (let i = 0; i < 60; i += 1) {
      await new Promise((r) => setTimeout(r, 250));
      if (await evaluate(`document.readyState === "complete"`)) break;
    }
    await new Promise((r) => setTimeout(r, 700));
  };
  const shot = async (name) => writeFileSync(`${SHOTS}/${name}.png`, Buffer.from((await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false })).data, "base64"));
  const sweep = async (name, width, selector) => {
    const r = await evaluate(`(() => {
      const root = document.documentElement;
      const small = [...document.querySelectorAll(${JSON.stringify(selector)})].flatMap((scope) => [...scope.querySelectorAll("a,button"), ...(scope.matches("a,button") ? [scope] : [])])
        .filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && (b.height < 44 || b.width < 44); })
        .map((el) => (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 30) + " " + Math.round(el.getBoundingClientRect().width) + "x" + Math.round(el.getBoundingClientRect().height));
      return { sw: root.scrollWidth, iw: window.innerWidth, sx: window.scrollX, text: document.body.innerText, small };
    })()`);
    check(`${name}: no horizontal overflow`, r.sw <= r.iw && r.iw === width && r.sx === 0, JSON.stringify({ sw: r.sw, iw: r.iw, sx: r.sx }));
    const raw = r.text.match(/\b(?:portal|fees)\.[a-zA-Z]+(?:\.[a-zA-Z]+)+/g);
    check(`${name}: no raw message keys`, !raw, String(raw));
    check(`${name}: no secret on screen`, !/SECRET/.test(r.text));
    check(`${name}: touch targets at least 44 px`, r.small.length === 0, r.small.join(" | "));
    return r;
  };
  const clickSelector = async (selector) => {
    const box = await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; e.scrollIntoView({ block: "center" }); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
    if (!box) return false;
    for (const type of ["mousePressed", "mouseReleased"]) await cdp("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", clickCount: 1, pointerType: "mouse" });
    await new Promise((r) => setTimeout(r, 400));
    return true;
  };

  for (const locale of ["fr", "ar"]) {
    for (const width of [390, 1366]) {
      const tag = `${locale}-${width}`;
      await go(`/${locale}/portal/fees?child=${kid}`, width);
      const r = await sweep(`fees ${tag}`, width, "[data-parent-fees]");
      check(`fees ${tag}: dir`, (await evaluate("document.documentElement.dir")) === (locale === "ar" ? "rtl" : "ltr"));
      check(`fees ${tag}: Remise line shown`, locale === "fr" ? r.text.includes("Remise") : r.text.includes("تخفيض"));
      const cells = await evaluate(`[...document.querySelectorAll("[data-month]")].map((e) => e.dataset.monthState)`);
      check(`fees ${tag}: all states rendered`, ["paid", "partial", "unpaid", "notDue", "cancelled"].every((s) => cells.includes(s)), cells.join());
      await shot(`fees-${tag}`);
      const full = await evaluate("document.documentElement.scrollHeight");
      if (width === 390) {
        await cdp("Emulation.setDeviceMetricsOverride", { width, height: Math.min(full, 2200), deviceScaleFactor: 1, mobile: true });
        await new Promise((res) => setTimeout(res, 300));
        await shot(`fees-${tag}-full`);
        await cdp("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: true });
      }
      // Tap a month that has a service and a discount: the read-only breakdown.
      check(`fees ${tag}: tapping a month opens it`, await clickSelector(`[data-month="${months[3]}"]`));
      const details = await evaluate(`(() => { const d = document.querySelector("[data-month-details]"); if (!d) return null; const b = d.getBoundingClientRect(); return { text: d.innerText, left: b.left, right: b.right, buttons: d.querySelectorAll("button").length, iw: window.innerWidth, sw: document.documentElement.scrollWidth }; })()`);
      check(`fees ${tag}: breakdown lists tuition + service, inside the screen, no action button`,
        !!details && details.buttons === 0 && details.left >= 0 && details.right <= details.iw && details.sw <= details.iw
          && (locale === "fr" ? details.text.includes("Scolarité") && details.text.includes("Transport") : details.text.includes("النقل المدرسي")), JSON.stringify(details));
      await shot(`fees-${tag}-month`);
      await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });

      await go(`/${locale}/portal?child=${kid}`, width);
      const home = await sweep(`home ${tag}`, width, "[data-home-tile]");
      const tile = await evaluate(`document.querySelector('[data-home-tile="fees"]')?.innerText ?? ""`);
      check(`home ${tag}: fees tile without an amount`, tile.length > 0 && !/\d/.test(tile), tile);
      void home;
      await shot(`home-${tag}`);

      await go(`/${locale}/print/my-receipts/${p1.payment_id}`, width);
      const receipt = await sweep(`receipt ${tag}`, width, "div.sticky");
      check(`receipt ${tag}: DUPLICATA + parent line, no stamp box`,
        (await evaluate(`document.querySelector("[data-receipt-sheet]")?.dataset.receiptCopy`)) === "duplicate"
          && (await evaluate(`!!document.querySelector("[data-receipt-parent-copy]") && !document.querySelector("[data-receipt-stamp]")`)));
      check(`receipt ${tag}: Massar code shown`, receipt.text.includes("R130045678"));
      await shot(`receipt-${tag}`);
      if (width === 1366) {
        const pdf = Buffer.from((await cdp("Page.printToPDF", { preferCSSPageSize: true, printBackground: true })).data, "base64");
        writeFileSync(`${SHOTS}/receipt-${locale}.pdf`, pdf);
        const text = pdf.toString("latin1");
        const pages = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
        const box = /\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)/.exec(text);
        check(`receipt ${locale}: PDF one A5 page`, pages === 1 && !!box && Math.abs(Number(box[1]) - 419.5) < 3 && Math.abs(Number(box[2]) - 595.3) < 3, JSON.stringify({ pages, box: box?.slice(1, 3) }));
      }
    }
  }
  // Year switch + other child.
  await go(`/fr/portal/fees?child=${kid}`, 390);
  check("two years: the switch shows and opens on the current year", (await evaluate(`document.querySelector("[data-fee-year]")?.dataset.feeYear`)) === year && (await evaluate(`document.querySelector('nav[aria-label="Années scolaires"]')?.children.length`)) === 2);
  await go(`/fr/portal/fees?child=${kid}&year=${pastYear}`, 390);
  check("the past year opens with its own figures", (await evaluate(`document.querySelector("[data-fee-year]")?.dataset.feeYear`)) === pastYear && (await evaluate(`document.querySelector('[data-fee-fact="total"]')?.dataset.amount`)) === "90000");
  await go(`/fr/portal/fees?child=${kid2}`, 390);
  check("the other child: no discount line, no year switch", !(await evaluate(`document.body.innerText`)).includes("Remise") && !(await evaluate(`!!document.querySelector('nav[aria-label="Années scolaires"]')`)));
  check("no console errors anywhere", consoleErrors.length === 0, [...new Set(consoleErrors)].slice(0, 8).join(" || "));
  if (before && before.id !== year) {
    must(await admin.from("academic_years").update({ is_current: false }).eq("id", year), "this year off");
    must(await admin.from("academic_years").update({ is_current: true }).eq("id", before.id), "before back");
  }
  ws.close();
} catch (error) {
  check("aborted", false, error.stack);
} finally {
  if (chrome) {
    chrome.kill();
    await new Promise((r) => setTimeout(r, 1000));
    rmSync(PROFILE, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  const left = await removeFixtures(fx);
  process.exitCode = results.length > 0 && results.every(Boolean) && !left.length ? 0 : 1;
  if (left.length) console.error("Cleanup incomplete:", left.join(", "));
}
