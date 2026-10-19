// Phase 8 closing pass: school B produces each kind of message — an absence
// notification (10 minutes after the roll call), a daily alert, a subscription
// reminder — while a parent, a teacher and the director of school A listen on
// Realtime. They receive none of it, read none of it through the API, cannot
// mark any of it read, and cannot read B's alert rules, alert log, reminder
// log or waiting absences. B's own parent and director do receive theirs
// (control).
import { randomBytes } from "node:crypto";

import { check, denied, rows } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";
import { randomMobile } from "./phase5-guardians.mjs";

const DAY = 86_400_000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const isoDow = (t) => ((new Date(t).getUTCDay() + 6) % 7) + 1;

export async function phase8CrossSchool({ fx, as }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const must = (r, what) => {
    if (r.error) throw new Error(`phase8CrossSchool setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (query, what) => must(await query.select("id").single(), what).id;
  const now = Date.now(); // Morocco is UTC+0: the UTC date is the school's date
  const today = iso(now);
  let pastTime = now - DAY;
  while (isoDow(pastTime) === 7) pastTime -= DAY;
  const past = iso(pastTime);
  const dow = isoDow(pastTime);

  const account = async (name, school, roleId) => {
    const email = `rls-test+${fx.run}-${name}@example.com`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), name).user;
    fx.createdUserIds.push(user.id);
    must(await admin.from("profiles").insert({ id: user.id, school_id: school.id, role_id: roleId, full_name: `RLS ${name}`, must_change_password: false }), name);
    return { id: user.id, client: await signIn({ email, password }) };
  };

  // --- School B: a year, a lesson, a student with a parent account -----------------------------------
  const { data: existing } = await admin.from("academic_years").select("id").eq("school_id", B.id)
    .lte("start_date", past).gte("end_date", today).maybeSingle();
  const ownYear = !existing;
  const year = existing?.id ?? await id(admin.from("academic_years").insert({
    school_id: B.id, label: "X8-annee", start_date: iso(now - 60 * DAY), end_date: iso(now + 200 * DAY), is_current: false,
  }), "year");
  const { data: dayRow } = await admin.from("school_days").select("day_of_week").eq("academic_year_id", year).eq("day_of_week", dow).maybeSingle();
  if (!dayRow) must(await admin.from("school_days").insert({ school_id: B.id, academic_year_id: year, day_of_week: dow }), "day");
  const slot = await id(admin.from("time_slots").insert({
    school_id: B.id, academic_year_id: year, day_of_week: dow, start_time: "18:00", end_time: "18:30", kind: "lesson",
  }), "slot");
  const level = await id(admin.from("levels").insert({ school_id: B.id, name: "X8-Niveau", cycle: "college" }), "level");
  const klass = await id(admin.from("classes").insert({ school_id: B.id, academic_year_id: year, level_id: level, name: "X8-1" }), "class");
  const subject = await id(admin.from("subjects").insert({ school_id: B.id, name: "X8-Physique" }), "subject");
  const tchB = await account("x8tchb", B, B.roles.teacher);
  must(await as.dirB.from("teacher_subjects").insert({ school_id: B.id, teacher_id: tchB.id, subject_id: subject }), "teaches");
  const lesson = await id(admin.from("lessons").insert({
    school_id: B.id, academic_year_id: year, time_slot_id: slot, class_id: klass, subject_id: subject, teacher_id: tchB.id,
  }), "lesson");
  const kidB = await id(admin.from("students").insert({ school_id: B.id, first_name: "Kid", last_name: "X8B", birth_date: "2014-01-01", gender: "male" }), "kid");
  must(await admin.from("student_enrollments").insert({ school_id: B.id, student_id: kidB, academic_year_id: year, class_id: klass }), "enrol");
  const parB = await account("x8parb", B, B.roles.parent);
  const guardian = await id(admin.from("guardians").insert({ school_id: B.id, last_name: "X8B", first_name: "Parent", phone: randomMobile(), profile_id: parB.id }), "guardian");
  must(await admin.from("student_guardians").insert({ school_id: B.id, student_id: kidB, guardian_id: guardian, relation: "father" }), "link");

  // --- Observers in school A ------------------------------------------------------------------------
  const parA = await account("x8para", A, A.roles.parent);
  const observers = [["a parent of A", parA.client], ["a teacher of A", as.tchA], ["the director of A", as.dirA]];
  // Give school A the alerts module too: A's director then holds a real alerts.manage.
  must(await admin.from("school_modules").upsert([
    { school_id: A.id, module_key: "alerts", enabled: true },
    { school_id: B.id, module_key: "alerts", enabled: true },
  ], { onConflict: "school_id,module_key" }), "alerts on");

  // --- Everyone listens --------------------------------------------------------------------------------
  const listen = (client, bucket) =>
    new Promise((resolve) => {
      const channel = client.channel(`x8-${randomBytes(4).toString("hex")}`)
        .on("system", {}, (m) => { if (m.extension === "postgres_changes" && m.status === "ok") resolve(channel); })
        .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, (m) => bucket.push(m.new ?? m.old));
      channel.subscribe((status) => { if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") resolve(null); });
      setTimeout(() => resolve(null), 10_000);
    });
  const heard = new Map();
  const channels = [];
  for (const [who, client] of [...observers, ["B's parent", parB.client], ["B's director", as.dirB]]) {
    heard.set(who, []);
    channels.push(await listen(client, heard.get(who)));
  }
  check("[P8 cross-school] everyone is subscribed to Realtime", channels.every(Boolean), `${channels.filter(Boolean).length}/${channels.length}`);

  // --- B produces one of each ------------------------------------------------------------------------
  const session = must(await as.dirB.rpc("save_attendance", { p_lesson: lesson, p_date: past, p_marks: [{ student_id: kidB, status: "absent" }] }), "B roll call");
  must(await admin.rpc("run_absence_notifications", { p_now: new Date(Date.now() + 11 * 60_000).toISOString() }), "absence run");
  must(await admin.from("alert_rules").update({ threshold: 1 }).eq("school_id", B.id).eq("type", "unjustified_absences"), "B threshold 1");
  must(await admin.rpc("run_daily_alerts", { p_today: today }), "daily run");
  const subB = must(await admin.from("school_subscriptions").select("id").eq("school_id", B.id).neq("status", "expired").single(), "B sub").id;
  must(await admin.from("school_subscriptions").update({ status: "active", end_date: iso(now + 3 * DAY) }).eq("id", subB), "B ends soon");
  must(await admin.rpc("run_subscription_reminders", { p_today: today, p_schools: [B.id] }), "reminder run");

  const isB = (n) => n?.school_id === B.id || n?.student_id === kidB || n?.data?.school_id === B.id;
  for (let i = 0; i < 40 && heard.get("B's director").length === 0; i++) await new Promise((r) => setTimeout(r, 250));
  await new Promise((r) => setTimeout(r, 1500)); // time for a wrongly delivered event to arrive

  // Control: B's own people get theirs.
  const types = (who) => heard.get(who).map((n) => n.type).sort().join();
  check("[P8 cross-school] control: B's parent is sent the absence and the daily alert", types("B's parent") === "absence,unjustified_absences", types("B's parent"));
  check("[P8 cross-school] control: B's director is sent the subscription reminder", types("B's director") === "subscription_expiring", types("B's director"));

  // --- A's people: nothing of B, by Realtime or the API -----------------------------------------------
  const { data: bRows } = await admin.from("notifications").select("id").or(`school_id.eq.${B.id},student_id.eq.${kidB}`);
  check("[P8 cross-school] B holds the three kinds of rows", bRows.length >= 3, `${bRows.length} row(s)`);
  for (const [who, client] of observers) {
    check(`[P8 cross-school] ${who}: no Realtime event about B`, heard.get(who).filter(isB).length === 0, `${heard.get(who).filter(isB).length} event(s)`);
    await rows(`[P8 cross-school] ${who}: reads none of B's notifications`, client.from("notifications").select("id").in("id", bRows.map((n) => n.id)), 0);
    await rows(`[P8 cross-school] ${who}: reads nothing about B's school in any notification`,
      client.from("notifications").select("id").filter("data->>school_id", "eq", B.id), 0);
    await denied(`[P8 cross-school] ${who}: cannot mark B's notifications read`,
      client.from("notifications").update({ read_at: new Date().toISOString() }).in("id", bRows.map((n) => n.id)).select("id"));
    await rows(`[P8 cross-school] ${who}: reads none of B's alert rules`, client.from("alert_rules").select("type").eq("school_id", B.id), 0);
    for (const table of ["alert_events", "subscription_reminders", "absence_notices"]) {
      const q = await client.from(table).select("school_id").eq("school_id", B.id);
      check(`[P8 cross-school] ${who}: cannot read B's ${table}`, Boolean(q.error) || q.data?.length === 0, q.error?.code ?? `${q.data?.length} row(s)`);
    }
    const q = await client.from("alert_rules").update({ threshold: 9 }).eq("school_id", B.id).select("type");
    check(`[P8 cross-school] ${who}: cannot change B's alert rules`, Boolean(q.error) || q.data?.length === 0, q.error?.code ?? `${q.data?.length} row(s)`);
  }
  check("[P8 cross-school] …B's rule is unchanged",
    (await admin.from("alert_rules").select("threshold").eq("school_id", B.id).eq("type", "unjustified_absences").single()).data.threshold === 1);
  await rows("[P8 cross-school] none of A's people was sent a notification at all",
    admin.from("notifications").select("id").in("recipient_id", [parA.id, fx.users.tchA.id, fx.users.dirA.id]), 0);

  // --- Clean up ------------------------------------------------------------------------------------------
  for (const ch of channels) if (ch) await ch.unsubscribe();
  await admin.from("notifications").delete().or(`school_id.eq.${B.id},student_id.eq.${kidB}`);
  await admin.from("notifications").delete().eq("type", "subscription_expiring").filter("data->>school_id", "eq", B.id);
  await admin.from("school_subscriptions").update({ status: "trial", end_date: null }).eq("id", subB);
  await admin.from("subscription_reminders").delete().eq("school_id", B.id);
  await admin.from("school_modules").delete().in("school_id", [A.id, B.id]).eq("module_key", "alerts");
  await admin.from("alert_rules").update({ threshold: 3 }).eq("school_id", B.id).eq("type", "unjustified_absences");
  await admin.from("attendance_sessions").delete().eq("id", session);
  await admin.from("absence_notices").delete().eq("student_id", kidB);
  await admin.from("student_guardians").delete().eq("student_id", kidB);
  await admin.from("guardians").delete().eq("id", guardian);
  await admin.from("students").delete().eq("id", kidB);
  await admin.from("lessons").delete().eq("id", lesson);
  await admin.from("teacher_subjects").delete().eq("subject_id", subject);
  await admin.from("classes").delete().eq("id", klass);
  await admin.from("time_slots").delete().eq("id", slot);
  if (!dayRow) await admin.from("school_days").delete().eq("academic_year_id", year).eq("day_of_week", dow);
  if (ownYear) await admin.from("academic_years").delete().eq("id", year);
  await admin.from("levels").delete().eq("id", level);
  await admin.from("subjects").delete().eq("id", subject);
}
