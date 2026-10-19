// Home page "Demander une démo": demo_requests. Visitors (anon) may only INSERT
// the form's columns — never read, change or delete, never set the dates or
// "handled"; the same phone at most 3 times in 24 h; school users have no access;
// only the platform owner reads requests and marks them handled (handled_by is
// recorded); every new request notifies the platform owner (row without a school).
// The overall limit (30 / hour) is not run here: it would block real visitors
// for an hour. It was checked once in a rolled-back transaction (2026-10-19).
import { randomInt } from "node:crypto";

import { check, denied, rows } from "./checks.mjs";
import { admin } from "./fixtures.mjs";

/** A fresh Moroccan mobile for this run: +2127 + 8 digits. */
export function testPhone() {
  return `+2127${String(randomInt(0, 1e8)).padStart(8, "0")}`;
}

/** Removes the requests (and their notifications) of these phones. */
export async function removeDemoRequests(phones) {
  await admin.from("notifications").delete().eq("type", "demo_request").in("data->>phone", phones);
  await admin.from("demo_requests").delete().in("phone", phones);
}

export async function publicDemoRequests({ fx, as }) {
  const phone = testPhone();
  const other = testPhone();
  const request = (overrides = {}) => ({
    full_name: "  RLS   Demo Visitor ",
    school_name: "RLS École Démo",
    city: "Rabat",
    phone,
    students: "200_500",
    locale: "fr",
    ...overrides,
  });
  const code = async (query) => (await query).error?.code ?? "none";

  try {
    // --- Visitors ----------------------------------------------------------------------------------------
    check("[demo] a visitor sends a request", (await code(as.anon.from("demo_requests").insert(request()))) === "none");
    check("[demo] …but cannot read it back (no SELECT grant)",
      (await code(as.anon.from("demo_requests").select("id").eq("phone", phone))) === "42501");
    check("[demo] …nor insert-and-return the row",
      (await code(as.anon.from("demo_requests").insert(request({ phone: other })).select("id"))) === "42501");
    check("[demo] a visitor cannot mark a request handled (no column grant)",
      (await code(as.anon.from("demo_requests").insert(request({ phone: other, handled_at: new Date().toISOString() })))) === "42501");
    check("[demo] …nor choose its date",
      (await code(as.anon.from("demo_requests").insert(request({ phone: other, created_at: "2020-01-01T00:00:00Z" })))) === "42501");
    check("[demo] a landline / foreign number is refused (CHECK)",
      (await code(as.anon.from("demo_requests").insert(request({ phone: "+212522123456" })))) === "23514");
    check("[demo] an unknown student range is refused (CHECK)",
      (await code(as.anon.from("demo_requests").insert(request({ phone: other, students: "lots" })))) === "23514");
    await denied("[demo] a visitor cannot change requests", as.anon.from("demo_requests").update({ city: "X" }).eq("phone", phone).select("id"));
    await denied("[demo] a visitor cannot delete requests", as.anon.from("demo_requests").delete().eq("phone", phone).select("id"));

    // --- Stored as the database decides -------------------------------------------------------------------
    await rows("[demo] stored once, text tidied, not handled, dated now", admin.from("demo_requests").select("*").eq("phone", phone), (r) =>
      r.length === 1 && r[0].full_name === "RLS Demo Visitor" && r[0].handled_at === null && r[0].handled_by === null
      && Math.abs(Date.parse(r[0].created_at) - Date.now()) < 120_000);

    // --- Same phone: 3 per 24 hours -----------------------------------------------------------------------
    check("[demo] the same phone a 2nd time: accepted", (await code(as.anon.from("demo_requests").insert(request()))) === "none");
    check("[demo] a 3rd time: accepted", (await code(as.anon.from("demo_requests").insert(request()))) === "none");
    const limited = await as.anon.from("demo_requests").insert(request());
    check("[demo] a 4th time within 24 h: refused (demo_rate_limited, hint phone)",
      limited.error?.message === "demo_rate_limited" && limited.error?.hint === "phone", limited.error?.message ?? "accepted!");
    check("[demo] …another phone is not limited", (await code(as.anon.from("demo_requests").insert(request({ phone: other })))) === "none");

    // --- School users: nothing ----------------------------------------------------------------------------
    await rows("[demo] a school director reads no request", as.dirA.from("demo_requests").select("id").in("phone", [phone, other]), 0);
    check("[demo] a school director cannot send one through the API (anon only)",
      (await code(as.dirA.from("demo_requests").insert(request({ phone: other })))) === "42501");
    await denied("[demo] a school director cannot mark one handled",
      as.dirA.from("demo_requests").update({ handled_at: new Date().toISOString() }).eq("phone", phone).select("id"));

    // --- Platform owner -----------------------------------------------------------------------------------
    await rows("[demo] the platform owner reads the requests", as.owner.from("demo_requests").select("id").in("phone", [phone, other]), 4);
    const target = (await admin.from("demo_requests").select("id").eq("phone", other).single()).data.id;
    const handled = await as.owner.from("demo_requests").update({ handled_at: new Date().toISOString() }).eq("id", target).select("handled_by");
    check("[demo] the platform owner marks one handled; handled_by = them",
      !handled.error && handled.data?.[0]?.handled_by === fx.users.owner.id, handled.error?.code ?? "");
    const reopened = await as.owner.from("demo_requests").update({ handled_at: null }).eq("id", target).select("handled_by");
    check("[demo] …and back to 'to handle' (handled_by cleared)", !reopened.error && reopened.data?.[0]?.handled_by === null);
    check("[demo] the platform owner cannot rewrite a request (column grant)",
      (await code(as.owner.from("demo_requests").update({ phone: "+212600000000" }).eq("id", target))) === "42501");
    check("[demo] …nor delete one", (await code(as.owner.from("demo_requests").delete().eq("id", target))) === "42501");

    // --- Notifications ------------------------------------------------------------------------------------
    await rows("[demo] the platform owner is notified once per request, on a row without a school",
      as.owner.from("notifications").select("school_id, data").eq("type", "demo_request").in("data->>phone", [phone, other]), (r) =>
        r.length === 4 && r.every((n) => n.school_id === null) && r.some((n) => n.data.school_name === "RLS École Démo" && n.data.city === "Rabat"));
    await rows("[demo] a school director receives no demo notification",
      admin.from("notifications").select("id").eq("type", "demo_request").eq("recipient_id", fx.users.dirA.id), 0);
  } finally {
    await removeDemoRequests([phone, other]);
  }
}
