// Phase 8 step 1: notifications + absence notifications. A student marked
// absent → 10 minutes later each parent account (own password set) is told;
// corrected within 10 minutes → nothing; corrected after → a correction to the
// same parents ('late', 'present', or 'cancelled' when the whole roll call is
// deleted). Only the last 7 days. People read only their own notifications and
// may only mark them read; nobody writes them through the API. Tests skip the
// 10 minutes by running the sender with a later time (secret key only).
import { randomBytes } from "node:crypto";

import { check, denied, rows, skip } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";
import { randomMobile } from "./phase5-guardians.mjs";

const DAY = 86_400_000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const isoDow = (t) => ((new Date(t).getUTCDay() + 6) % 7) + 1;

export async function phase8Notifications({ fx, as }) {
  const A = fx.schools.a;
  const { survA, dirA, tchA, dirB, owner } = as;
  const must = (r, what) => {
    if (r.error) throw new Error(`phase8Notifications setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (query, what) => must(await query.select("id").single(), what).id;
  const now = Date.now(); // Morocco is UTC+0: the UTC date is the school's date
  let pastTime = now - DAY;
  while (isoDow(pastTime) === 7) pastTime -= DAY;
  const past = iso(pastTime);
  const old = iso(pastTime - 7 * DAY); // same weekday, more than 7 days ago
  const dow = isoDow(pastTime);
  const run = async (minutesAhead = 11) =>
    must(await admin.rpc("run_absence_notifications", { p_now: new Date(Date.now() + minutesAhead * 60_000).toISOString() }), "run");

  // --- Parents: par1 + par2 of kid1, par3 of kid2 (temporary password), par4 of kid3 -------------
  const account = async (name, mustChange = false) => {
    const email = `rls-test+${fx.run}-${name}@example.com`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), name).user;
    fx.createdUserIds.push(user.id);
    must(await admin.from("profiles").insert({ id: user.id, school_id: A.id, role_id: A.roles.parent, full_name: `RLS ${name}`, must_change_password: false }), name);
    const client = await signIn({ email, password });
    if (mustChange) must(await admin.from("profiles").update({ must_change_password: true }).eq("id", user.id), "temp password");
    return { id: user.id, client };
  };
  const par1 = await account("n8par1");
  const par2 = await account("n8par2");
  const par3 = await account("n8par3", true);
  const par4 = await account("n8par4");

  // --- A year containing the old day and today, a lesson on that weekday --------------------------
  const { data: existing } = await admin.from("academic_years").select("id").eq("school_id", A.id)
    .lte("start_date", old).gte("end_date", iso(now)).maybeSingle();
  const ownYear = !existing;
  const year = existing?.id ?? await id(admin.from("academic_years").insert({
    school_id: A.id, label: "N8-annee", start_date: iso(now - 60 * DAY), end_date: iso(now + 200 * DAY), is_current: false,
  }), "year");
  const { data: dayRow } = await admin.from("school_days").select("day_of_week").eq("academic_year_id", year).eq("day_of_week", dow).maybeSingle();
  if (!dayRow) must(await admin.from("school_days").insert({ school_id: A.id, academic_year_id: year, day_of_week: dow }), "day");
  const slot = await id(admin.from("time_slots").insert({
    school_id: A.id, academic_year_id: year, day_of_week: dow, start_time: "20:00", end_time: "20:30", kind: "lesson",
  }), "slot");
  const level = await id(admin.from("levels").insert({ school_id: A.id, name: "N8-Niveau", cycle: "college" }), "level");
  const klass = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name: "N8-1" }), "class");
  const subject = await id(admin.from("subjects").insert({ school_id: A.id, name: "N8-Arabe" }), "subject");
  must(await dirA.from("teacher_subjects").insert({ school_id: A.id, teacher_id: fx.users.tchA.id, subject_id: subject }), "teaches");
  const lesson = await id(admin.from("lessons").insert({
    school_id: A.id, academic_year_id: year, time_slot_id: slot, class_id: klass, subject_id: subject, teacher_id: fx.users.tchA.id,
  }), "lesson");
  const kid = async (name, parents) => {
    const s = await id(admin.from("students").insert({ school_id: A.id, first_name: "Kid", last_name: name, birth_date: "2014-01-01", gender: "male" }), name);
    must(await admin.from("student_enrollments").insert({ school_id: A.id, student_id: s, academic_year_id: year, class_id: klass }), "enrol");
    for (const [i, par] of parents.entries()) {
      const g = await id(admin.from("guardians").insert({ school_id: A.id, last_name: name, first_name: "Parent", phone: randomMobile(), profile_id: par.id }), "guardian");
      must(await admin.from("student_guardians").insert({ school_id: A.id, student_id: s, guardian_id: g, relation: i ? "mother" : "father" }), "link");
    }
    return s;
  };
  const kid1 = await kid("N8K1", [par1, par2]);
  const kid2 = await kid("N8K2", [par3]);
  const kid3 = await kid("N8K3", [par4]);
  const kid4 = await kid("N8K4", []); // no parent account

  const save = (date, marks) => survA.rpc("save_attendance", { p_lesson: lesson, p_date: date, p_marks: marks });
  const absent = (s) => ({ student_id: s, status: "absent" });
  const late = (s, minutes) => ({ student_id: s, status: "late", minutes_late: minutes });
  const notes = (who) => admin.from("notifications").select("id, type, student_id, data, read_at").eq("recipient_id", who.id).order("created_at");
  const notices = (session) => admin.from("absence_notices").select("student_id, due_at, sent_at").eq("session_id", session);

  // --- Marked absent: waits 10 minutes -----------------------------------------------------------
  const session = must(await save(past, [absent(kid1), absent(kid2), late(kid3, 5), absent(kid4)]), "roll call");
  const { data: queued } = await notices(session);
  const due1 = queued?.find((n) => n.student_id === kid1)?.due_at;
  const wait = due1 ? (Date.parse(due1) - Date.now()) / 60_000 : 0;
  check("[P8 notif] absent students wait (one notice each, late ones none)",
    queued?.length === 3 && !queued.some((n) => n.student_id === kid3), JSON.stringify(queued?.map((n) => n.student_id === kid3)));
  check("[P8 notif] …due 10 minutes after the mark", wait > 9 && wait <= 10.1, `${wait.toFixed(2)} min`);
  await run(0);
  await rows("[P8 notif] nothing is sent before the 10 minutes", notes(par1), 0);

  // --- After 10 minutes ------------------------------------------------------------------------------
  const handled = await run();
  check("[P8 notif] the sender handles the 3 due absences", handled === 3, String(handled));
  for (const par of [par1, par2]) {
    await rows(`[P8 notif] parent ${par === par1 ? "1" : "2"} of the absent child is told once`, notes(par), (r) =>
      r.length === 1 && r[0].type === "absence" && r[0].student_id === kid1 && r[0].data.session_id === session
      && r[0].data.date === past && r[0].data.start === "20:00" && r[0].data.end === "20:30" && r[0].data.subject === "N8-Arabe");
  }
  await rows("[P8 notif] a parent who has not set their own password yet is not told", notes(par3), 0);
  await rows("[P8 notif] a late student's parent is not told", notes(par4), 0);
  check("[P8 notif] running again sends nothing twice", (await run()) === 0);
  await rows("[P8 notif] …still one notification", notes(par1), 1);

  // --- Corrected within the 10 minutes: nothing ---------------------------------------------------
  must(await save(past, [absent(kid1), absent(kid2), absent(kid3), absent(kid4)]), "kid3 absent");
  must(await save(past, [absent(kid1), absent(kid2), late(kid3, 5), absent(kid4)]), "kid3 late again");
  await rows("[P8 notif] corrected within 10 minutes: nothing waits", notices(session).eq("student_id", kid3), 0);
  await run();
  await rows("[P8 notif] …and nothing is sent", notes(par4), 0);

  // --- Corrected after it was sent: absent → late, → absent again, → present -----------------------
  must(await save(past, [late(kid1, 7), absent(kid2), late(kid3, 5), absent(kid4)]), "kid1 late");
  for (const par of [par1, par2]) {
    await rows(`[P8 notif] after sending, absent → late tells parent ${par === par1 ? "1" : "2"} at once`, notes(par), (r) =>
      r.length === 2 && r[1].type === "absence_corrected" && r[1].data.now === "late" && r[1].data.minutes_late === 7 && r[1].data.session_id === session);
  }
  must(await save(past, [absent(kid1), absent(kid2), late(kid3, 5), absent(kid4)]), "kid1 absent again");
  await run();
  await rows("[P8 notif] marked absent again → a new notification 10 minutes later", notes(par1), (r) => r.length === 3 && r[2].type === "absence");
  must(await save(past, [absent(kid2), late(kid3, 5), absent(kid4)]), "kid1 present");
  await rows("[P8 notif] mark removed after sending → 'present' correction", notes(par1), (r) =>
    r.length === 4 && r[3].type === "absence_corrected" && r[3].data.now === "present");

  // --- Roll call deleted after sending → 'cancelled' ------------------------------------------------
  must(await save(past, [absent(kid1), absent(kid2), late(kid3, 5), absent(kid4)]), "kid1 absent once more");
  await run();
  const del = await survA.from("attendance_sessions").delete().eq("id", session).select("id");
  check("[P8 notif] staff delete the whole roll call", !del.error && del.data?.length === 1, del.error?.message ?? "");
  for (const par of [par1, par2]) {
    await rows(`[P8 notif] …parent ${par === par1 ? "1" : "2"} gets 'cancelled'`, notes(par), (r) =>
      r.length === 6 && r[5].type === "absence_corrected" && r[5].data.now === "cancelled");
  }
  await rows("[P8 notif] …and nothing of that roll call waits any more", notices(session), 0);

  // --- Older than 7 days: nothing -------------------------------------------------------------------
  const oldSession = must(await save(old, [absent(kid1)]), "old roll call");
  await rows("[P8 notif] an absence more than 7 days ago is not notified", notices(oldSession), 0);

  // --- Module off when due: nothing --------------------------------------------------------------------
  const s2 = must(await save(past, [absent(kid3)]), "kid3 absent");
  must(await admin.from("school_modules").insert({ school_id: A.id, module_key: "attendance", enabled: false }), "module off");
  await run();
  must(await admin.from("school_modules").delete().eq("school_id", A.id).eq("module_key", "attendance"), "module back");
  await rows("[P8 notif] attendance module off when due: nothing sent", notes(par4), 0);

  // --- Deleting a student whose absence was sent: works, no correction ---------------------------
  must(await save(past, [absent(kid3), absent(kid2)]), "kid2 absent");
  await run();
  const gone = await admin.from("students").delete().eq("id", kid2).select("id");
  check("[P8 notif] a student whose absence was sent can still be deleted", !gone.error && gone.data?.length === 1, gone.error?.message ?? "");

  // --- Teachers (same day only: not on Sundays) --------------------------------------------------
  if (isoDow(now) === 7) skip("[P8 notif] a teacher's own roll call queues the absence too", "today is Sunday (no lessons): runs Monday to Saturday");

  // --- Who reads / writes notifications ------------------------------------------------------------
  const [n1] = (await notes(par1)).data;
  const [n2] = (await notes(par2)).data;
  await rows("[P8 notif] a parent reads only their own notifications", par1.client.from("notifications").select("id"), (r) =>
    r.length === 6 && !r.some((x) => x.id === n2.id));
  await rows("[P8 notif] a parent marks their notification read", par1.client.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n1.id).select("id"), 1);
  await denied("[P8 notif] …but not another parent's", par1.client.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n2.id).select("id"));
  await denied("[P8 notif] …and cannot change what it says", par1.client.from("notifications").update({ data: {} }).eq("id", n1.id).select("id"));
  await denied("[P8 notif] a parent cannot create a notification", par1.client.from("notifications").insert({
    school_id: A.id, recipient_id: par1.id, type: "absence", student_id: kid1, data: {},
  }).select("id"));
  await denied("[P8 notif] a parent cannot delete one", par1.client.from("notifications").delete().eq("id", n1.id).select("id"));
  await denied("[P8 notif] staff cannot create one either", survA.from("notifications").insert({
    school_id: A.id, recipient_id: par1.id, type: "absence", data: {},
  }).select("id"));
  for (const [who, client] of [["the surveillant", survA], ["the director", dirA], ["a teacher", tchA], ["another school's director", dirB], ["the platform owner", owner]]) {
    await rows(`[P8 notif] ${who} reads no parent's notifications`, client.from("notifications").select("id").in("recipient_id", [par1.id, par2.id]), 0);
  }
  for (const [who, client] of [["a parent", par1.client], ["the surveillant", survA]]) {
    const q = await client.from("absence_notices").select("session_id").limit(1);
    check(`[P8 notif] ${who} cannot read the waiting absences`, Boolean(q.error) || q.data?.length === 0, q.error?.code ?? `${q.data?.length} row(s)`);
  }
  const call = await dirA.rpc("run_absence_notifications", {});
  check("[P8 notif] a signed-in user cannot run the sender", call.error?.code === "42501", call.error?.code ?? "ACCEPTED!");

  // --- Realtime (step 2): a parent is sent their own new notification, nobody else's ----------------
  const heard = { own: [], other: [] };
  // Resolves once Realtime confirms the Postgres subscription (SUBSCRIBED alone comes a moment earlier).
  const listen = (client, bucket) =>
    new Promise((resolve) => {
      const channel = client.channel(`n8-${randomBytes(4).toString("hex")}`)
        .on("system", {}, (m) => { if (m.extension === "postgres_changes" && m.status === "ok") resolve(channel); })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, (m) => bucket.push(m.new.id));
      channel.subscribe((status) => { if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") resolve(null); });
      setTimeout(() => resolve(null), 10_000);
    });
  const chOwn = await listen(par1.client, heard.own);
  const chOther = await listen(par4.client, heard.other);
  check("[P8 notif] Realtime: both parents subscribe", Boolean(chOwn && chOther));
  const s3 = must(await save(past, [absent(kid1)]), "realtime roll call");
  await run();
  for (let i = 0; i < 40 && heard.own.length === 0; i++) await new Promise((r) => setTimeout(r, 250));
  await new Promise((r) => setTimeout(r, 1000)); // time for a wrongly delivered event to arrive
  const [latest] = (await notes(par1)).data.slice(-1);
  check("[P8 notif] Realtime: the parent is sent their new notification", heard.own.length === 1 && heard.own[0] === latest.id, `${heard.own.length} event(s)`);
  check("[P8 notif] Realtime: another parent is sent nothing", heard.other.length === 0, `${heard.other.length} event(s)`);
  for (const ch of [chOwn, chOther]) if (ch) await ch.unsubscribe();
  await admin.from("absence_notices").delete().eq("session_id", s3);

  // --- Clean up ---------------------------------------------------------------------------------------
  await admin.from("attendance_sessions").delete().eq("class_id", klass);
  await admin.from("absence_notices").delete().in("session_id", [session, oldSession, s2]);
  await admin.from("notifications").delete().in("recipient_id", [par1.id, par2.id, par3.id, par4.id]);
  await admin.from("student_guardians").delete().in("student_id", [kid1, kid3, kid4]);
  await admin.from("guardians").delete().in("profile_id", [par1.id, par2.id, par3.id, par4.id]);
  await admin.from("student_enrollments").delete().in("student_id", [kid1, kid3, kid4]);
  await admin.from("students").delete().in("id", [kid1, kid3, kid4]);
  await admin.from("lessons").delete().eq("id", lesson);
  await admin.from("teacher_subjects").delete().eq("subject_id", subject);
  await admin.from("classes").delete().eq("id", klass);
  await admin.from("time_slots").delete().eq("id", slot);
  if (!dayRow) await admin.from("school_days").delete().eq("academic_year_id", year).eq("day_of_week", dow);
  if (ownYear) await admin.from("academic_years").delete().eq("id", year);
  await admin.from("levels").delete().eq("id", level);
  await admin.from("subjects").delete().eq("id", subject);
}
