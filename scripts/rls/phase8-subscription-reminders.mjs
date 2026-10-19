// Phase 8 step 5: subscription reminders. Last day = end_date (active) or the
// Morocco date of trial_ends_at (trial); reminders at 30 / 7 / 1 / 0 days,
// each step once per subscription and last day, a step reached late is sent
// at once (catch-up), a new last day starts again. Directors of an ACTIVE
// school + every platform owner; platform rows have no school. Tests run the
// check on chosen days for their own schools only (secret key).
import { randomBytes } from "node:crypto";

import { check, denied, rows } from "./checks.mjs";
import { admin } from "./fixtures.mjs";

const DAY = 86_400_000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);

export async function phase8SubscriptionReminders({ fx, as }) {
  const { A, B, C } = { A: fx.schools.a, B: fx.schools.b, C: fx.schools.c };
  const schoolIds = [A.id, B.id, C.id];
  const must = (r, what) => {
    if (r.error) throw new Error(`phase8SubscriptionReminders setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const T = iso(Date.now()); // Morocco is UTC+0: the UTC date is the school's date
  const day = (n) => iso(Date.parse(`${T}T12:00:00Z`) + n * DAY);
  const subOf = async (school) =>
    must(await admin.from("school_subscriptions").select("id").eq("school_id", school.id).neq("status", "expired").single(), "sub").id;
  const subs = { A: await subOf(A), B: await subOf(B), C: await subOf(C) };
  const setSub = (key, change) => admin.from("school_subscriptions").update(change).eq("id", subs[key]);
  const run = async (n) => must(await admin.rpc("run_subscription_reminders", { p_today: day(n), p_schools: schoolIds }), `run ${n}`);
  const told = (userId, school) => {
    let q = admin.from("notifications").select("school_id, data, read_at").eq("recipient_id", userId).eq("type", "subscription_expiring");
    if (school) q = q.filter("data->>school_id", "eq", school.id);
    return q.order("created_at");
  };
  const owner = fx.users.owner.id;

  // --- Active, last day in 40 days: 30 / 7 / 1 / 0 ---------------------------------------------------
  must(await setSub("A", { status: "active", end_date: day(40), trial_ends_at: null }), "A active");
  check("[P8 reminders] 40 days before: nothing yet", (await run(0)) === 0);
  check("[P8 reminders] 30 days before: a reminder", (await run(10)) === 1);
  await rows("[P8 reminders] …the school's director is told (school, plan, active, last day, 30 days)", told(fx.users.dirA.id), (r) =>
    r.length === 1 && r[0].data.school_id === A.id && r[0].data.status === "active" && r[0].data.last_day === day(40)
    && r[0].data.days_left === 30 && typeof r[0].data.plan === "string" && r[0].school_id === A.id);
  await rows("[P8 reminders] …the platform owner is told, on a row without a school", told(owner, A), (r) =>
    r.length === 1 && r[0].school_id === null && r[0].data.school_name.startsWith("RLS test A"));
  await rows("[P8 reminders] …a director who has not set their own password is not", told(fx.users.pendA.id), 0);
  await rows("[P8 reminders] …nor other staff", told(fx.users.survA.id), 0);
  check("[P8 reminders] the same day again: nothing twice", (await run(10)) === 0);
  check("[P8 reminders] 29 days before: still the 30-day step, nothing", (await run(11)) === 0);
  check("[P8 reminders] 7 days before: a reminder", (await run(33)) === 1);
  check("[P8 reminders] 5 days before: nothing (7-day step sent)", (await run(35)) === 0);
  check("[P8 reminders] 1 day before: a reminder", (await run(39)) === 1);
  check("[P8 reminders] the last day: a reminder", (await run(40)) === 1);
  check("[P8 reminders] the day after: nothing", (await run(41)) === 0);
  await rows("[P8 reminders] the director got exactly 4 (30, 7, 1, 0 days left)", told(fx.users.dirA.id), (r) =>
    r.map((n) => n.data.days_left).join() === "30,7,1,0");

  // --- A renewal (new last day) starts again ------------------------------------------------------------
  must(await setSub("A", { end_date: day(80) }), "A renewed");
  check("[P8 reminders] renewed: 30 days before the new last day → a reminder again", (await run(50)) === 1);

  // --- Trial ending in 5 days: the 7-day step is sent at once (catch-up) ---------------------------------
  must(await setSub("B", { status: "trial", trial_ends_at: `${day(5)}T23:59:59Z`, end_date: null }), "B trial");
  check("[P8 reminders] trial: last day = Morocco date of trial_ends_at, 5 days → sent at once", (await run(0)) === 1);
  await rows("[P8 reminders] …the director of B is told 'trial, 5 days left'", told(fx.users.dirB.id), (r) =>
    r.length === 1 && r[0].data.status === "trial" && r[0].data.days_left === 5 && r[0].data.last_day === day(5));
  check("[P8 reminders] …4 days left: nothing more", (await run(1)) === 0);

  // --- Never reminded: no last day, suspended or expired subscription ------------------------------------
  must(await setSub("B", { status: "active", trial_ends_at: null, end_date: null }), "B no end");
  check("[P8 reminders] active without an end date: never", (await run(4)) === 0);
  must(await setSub("B", { status: "suspended", end_date: day(3) }), "B suspended sub");
  check("[P8 reminders] a suspended subscription: no reminder", (await run(2)) === 0);
  must(await setSub("B", { status: "expired" }), "B expired sub");
  check("[P8 reminders] an expired subscription: no reminder", (await run(2)) === 0);

  // --- Suspended school: the platform owner is told, its director is not --------------------------------
  must(await setSub("C", { status: "active", end_date: day(3) }), "C active");
  check("[P8 reminders] suspended school, 3 days left: a reminder", (await run(0)) === 1);
  await rows("[P8 reminders] …the platform owner is told", told(owner, C), 1);
  await rows("[P8 reminders] …the suspended school's director is not", told(fx.users.dirC.id), 0);

  // --- Who reads what ----------------------------------------------------------------------------------------
  await rows("[P8 reminders] a director reads their own reminders", as.dirA.from("notifications").select("id").eq("type", "subscription_expiring"), 5);
  await rows("[P8 reminders] …none of school B's", as.dirA.from("notifications").select("id").filter("data->>school_id", "eq", B.id), 0);
  await rows("[P8 reminders] the director of B reads only B's", as.dirB.from("notifications").select("data").eq("type", "subscription_expiring"), (r) =>
    r.length === 1 && r[0].data.school_id === B.id);
  await rows("[P8 reminders] the platform owner reads their rows (no school)", as.owner.from("notifications").select("school_id").in("data->>school_id", schoolIds), (r) =>
    r.length === 7 && r.every((n) => n.school_id === null));
  await rows("[P8 reminders] the platform owner reads no school's own rows", as.owner.from("notifications").select("id").not("school_id", "is", null), 0);
  // A row without a school for a school user (never written by the database): still not readable by them.
  const { data: odd } = await admin.from("notifications").insert({ recipient_id: fx.users.dirA.id, school_id: null, type: "subscription_expiring", data: {} }).select("id").single();
  await rows("[P8 reminders] a school user never reads a row without a school, even addressed to them", as.dirA.from("notifications").select("id").eq("id", odd.id), 0);
  await admin.from("notifications").delete().eq("id", odd.id);
  const { error: noSchool } = await admin.from("notifications").insert({ recipient_id: fx.users.dirA.id, school_id: null, type: "absence", data: {} });
  check("[P8 reminders] only this type may have no school", noSchool?.code === "23514", noSchool?.code ?? "accepted!");

  const [ownRow] = must(await as.owner.from("notifications").select("id").in("data->>school_id", schoolIds).limit(1), "owner row");
  await rows("[P8 reminders] the platform owner marks their reminder read",
    as.owner.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", ownRow.id).select("id"), 1);
  await denied("[P8 reminders] …but cannot change what it says",
    as.owner.from("notifications").update({ data: {} }).eq("id", ownRow.id).select("id"));
  await denied("[P8 reminders] a director cannot mark the platform owner's reminder read",
    as.dirA.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", ownRow.id).select("id"));

  for (const [who, client] of [["a director", as.dirA], ["the platform owner", as.owner]]) {
    const q = await client.from("subscription_reminders").select("step").limit(1);
    check(`[P8 reminders] ${who} cannot read the reminder log`, Boolean(q.error) || q.data?.length === 0, q.error?.code ?? `${q.data?.length} row(s)`);
    const call = await client.rpc("run_subscription_reminders", { p_today: T, p_schools: schoolIds });
    check(`[P8 reminders] ${who} cannot run the check`, call.error?.code === "42501", call.error?.code ?? "ACCEPTED!");
  }

  // --- Realtime: the platform owner is sent their new reminder; a director of another school nothing -------
  const heard = { owner: [], dirB: [] };
  const listen = (client, bucket) =>
    new Promise((resolve) => {
      const channel = client.channel(`r8-${randomBytes(4).toString("hex")}`)
        .on("system", {}, (m) => { if (m.extension === "postgres_changes" && m.status === "ok") resolve(channel); })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, (m) => bucket.push(m.new));
      channel.subscribe((status) => { if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") resolve(null); });
      setTimeout(() => resolve(null), 10_000);
    });
  const chOwner = await listen(as.owner, heard.owner);
  const chB = await listen(as.dirB, heard.dirB);
  check("[P8 reminders] Realtime: both subscribe", Boolean(chOwner && chB));
  must(await setSub("A", { end_date: day(1) }), "A ends tomorrow");
  check("[P8 reminders] Realtime: a reminder for A", (await run(0)) === 1);
  for (let i = 0; i < 40 && heard.owner.length === 0; i++) await new Promise((r) => setTimeout(r, 250));
  await new Promise((r) => setTimeout(r, 1000));
  const ownerHeard = heard.owner.filter((n) => n.type === "subscription_expiring" && n.data?.school_id === A.id);
  check("[P8 reminders] Realtime: the platform owner is sent it", ownerHeard.length === 1, `${ownerHeard.length} event(s)`);
  check("[P8 reminders] Realtime: the director of B is sent nothing of A", heard.dirB.every((n) => n.data?.school_id === B.id), `${heard.dirB.length} event(s)`);
  for (const ch of [chOwner, chB]) if (ch) await ch.unsubscribe();

  // --- Clean up: platform rows outlive the schools, remove them; subscriptions back to a plain trial ----------
  await admin.from("notifications").delete().eq("type", "subscription_expiring").in("data->>school_id", schoolIds);
  for (const key of ["A", "B", "C"]) await setSub(key, { status: "trial", end_date: null, trial_ends_at: null });
  await admin.from("subscription_reminders").delete().in("school_id", schoolIds);
}
