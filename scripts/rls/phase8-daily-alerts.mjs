// Phase 8 step 4: the daily alerts. Unjustified absences = an absence nothing
// excuses on at least N DAYS of a calendar month → told once per student per
// month; repeated lateness = N lates in the window, only lates after the last
// alert count. Excused = approved justification, or pending one sent within
// the last 7 days (rejected = not excused). Recipients from the rule; alerts
// module + rule on. Tests pass the day (run_daily_alerts, secret key only).
import { randomBytes } from "node:crypto";

import { check, rows, skip } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";
import { randomMobile } from "./phase5-guardians.mjs";

const DAY = 86_400_000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const time = (d) => Date.parse(`${d}T12:00:00Z`);
const isoDow = (d) => ((new Date(time(d)).getUTCDay() + 6) % 7) + 1;
const addDays = (d, n) => iso(time(d) + n * DAY);
const monthStart = (d) => `${d.slice(0, 7)}-01`;
/** Monday–Saturday days from `from` to `to`, oldest first. */
const workDays = (from, to) => {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (isoDow(d) !== 7) out.push(d);
  return out;
};

export async function phase8DailyAlerts({ fx, as }) {
  const A = fx.schools.a;
  const { survA, dirA } = as;
  const must = (r, what) => {
    if (r.error) throw new Error(`phase8DailyAlerts setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (query, what) => must(await query.select("id").single(), what).id;
  const today = iso(Date.now()); // Morocco is UTC+0: the UTC date is the school's date

  // --- The year containing today (or our own) and the days we use ------------------------------------
  const { data: existing } = await admin.from("academic_years").select("id, start_date").eq("school_id", A.id)
    .lte("start_date", today).gte("end_date", today).maybeSingle();
  const ownYear = !existing;
  const year = existing ?? must(await admin.from("academic_years").insert({
    school_id: A.id, label: "D8-annee", start_date: addDays(today, -150), end_date: addDays(today, 200), is_current: false,
  }).select("id, start_date").single(), "year");

  // Absence days: 4 school days of one month, up to "P" (the day of the check), all in the year.
  let P = today;
  let absenceDays = null;
  for (let tries = 0; tries < 3 && !absenceDays; tries++) {
    const days = workDays(monthStart(P) < year.start_date ? year.start_date : monthStart(P), P);
    if (days.length >= 4) absenceDays = days.slice(0, 4);
    else P = addDays(monthStart(P), -1);
  }
  // Late days: the 6 most recent school days up to today, all in the year.
  const lateDays = workDays(addDays(today, -9), today).slice(-6);
  if (!absenceDays || lateDays.length < 6 || lateDays[0] < year.start_date) {
    skip("[P8 daily alerts] the whole suite", `the school year containing ${today} is too young (started ${year.start_date})`);
    if (ownYear) await admin.from("academic_years").delete().eq("id", year.id);
    return;
  }
  const [a1, a2, a3, a4] = absenceDays;
  const [L1, L2, L3, L4, L5, L6] = lateDays;

  // A lesson on each school day (Mon–Sat), 19:30–20:00.
  const level = await id(admin.from("levels").insert({ school_id: A.id, name: "D8-Niveau", cycle: "college" }), "level");
  const klass = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year.id, level_id: level, name: "D8-1" }), "class");
  const subject = await id(admin.from("subjects").insert({ school_id: A.id, name: "D8-Maths" }), "subject");
  must(await dirA.from("teacher_subjects").insert({ school_id: A.id, teacher_id: fx.users.tchA.id, subject_id: subject }), "teaches");
  const lessons = {};
  const addedDays = [];
  const slots = [];
  for (let dow = 1; dow <= 6; dow++) {
    const { data: dayRow } = await admin.from("school_days").select("day_of_week").eq("academic_year_id", year.id).eq("day_of_week", dow).maybeSingle();
    if (!dayRow) {
      must(await admin.from("school_days").insert({ school_id: A.id, academic_year_id: year.id, day_of_week: dow }), "day");
      addedDays.push(dow);
    }
    const slot = await id(admin.from("time_slots").insert({
      school_id: A.id, academic_year_id: year.id, day_of_week: dow, start_time: "19:30", end_time: "20:00", kind: "lesson",
    }), "slot");
    slots.push(slot);
    lessons[dow] = await id(admin.from("lessons").insert({
      school_id: A.id, academic_year_id: year.id, time_slot_id: slot, class_id: klass, subject_id: subject, teacher_id: fx.users.tchA.id,
    }), "lesson");
  }

  // --- People ----------------------------------------------------------------------------------------
  const created = [];
  const account = async (name, roleId, { mustChange = false, deactivated = false } = {}) => {
    const email = `rls-test+${fx.run}-${name}@example.com`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), name).user;
    fx.createdUserIds.push(user.id);
    created.push(user.id);
    must(await admin.from("profiles").insert({ id: user.id, school_id: A.id, role_id: roleId, full_name: `RLS ${name}`, must_change_password: false }), name);
    const client = await signIn({ email, password });
    const change = {};
    if (mustChange) change.must_change_password = true;
    if (deactivated) change.deactivated_at = new Date().toISOString();
    if (Object.keys(change).length) must(await admin.from("profiles").update(change).eq("id", user.id), `${name} state`);
    return { id: user.id, client };
  };
  // A custom role that manages attendance counts as "surveillance".
  const officerRole = await id(admin.from("roles").insert({ school_id: A.id, key: "alerts_officer", name: "D8 officer" }), "officer role");
  must(await admin.from("role_permissions").insert({ role_id: officerRole, permission_key: "attendance.manage" }), "officer permission");
  const officer = await account("d8officer", officerRole);
  const survOff = await account("d8survoff", A.roles.surveillant, { deactivated: true });
  const pendA = fx.users.pendA; // a director who has not set their own password yet

  const parents = {};
  for (const key of ["A", "A2", "B", "C", "D", "E", "F", "L", "P"]) {
    parents[key] = await account(`d8par${key.toLowerCase()}`, A.roles.parent, { mustChange: key === "A2" });
  }
  const kids = {};
  for (const key of ["A", "B", "C", "D", "E", "F", "L", "P"]) {
    const s = await id(admin.from("students").insert({ school_id: A.id, first_name: "Kid", last_name: `D8${key}`, birth_date: "2014-01-01", gender: "male" }), key);
    must(await admin.from("student_enrollments").insert({ school_id: A.id, student_id: s, academic_year_id: year.id, class_id: klass }), "enrol");
    const linked = key === "A" ? [parents.A, parents.A2] : [parents[key]];
    for (const [i, par] of linked.entries()) {
      const g = await id(admin.from("guardians").insert({ school_id: A.id, last_name: `D8${key}`, first_name: "Parent", phone: randomMobile(), profile_id: par.id }), "guardian");
      must(await admin.from("student_guardians").insert({ school_id: A.id, student_id: s, guardian_id: g, relation: i ? "mother" : "father" }), "link");
    }
    kids[key] = s;
  }

  // --- Roll calls: one save per day, every kid's mark of that day -------------------------------------
  const plan = new Map(); // date → marks
  const mark = (date, kid, status) => plan.set(date, [...(plan.get(date) ?? []), { student_id: kids[kid], status }]);
  for (const d of [a1, a2]) for (const k of ["A", "B", "C", "D", "E", "F"]) mark(d, k, "absent");
  for (const k of ["A", "C", "D", "E", "F"]) mark(a3, k, "absent");
  for (const d of lateDays) mark(d, "L", "late");
  for (const d of [L4, L5, L6]) mark(d, "P", "late");
  const sessions = {};
  const save = async (date) => {
    sessions[date] = must(await survA.rpc("save_attendance", { p_lesson: lessons[isoDow(date)], p_date: date, p_marks: plan.get(date) }), `roll call ${date}`);
  };
  for (const date of plan.keys()) await save(date);

  // Justifications on a3 (absences) and L6 (lateness).
  const days = (kid, date) => ({ school_id: A.id, student_id: kids[kid], kind: "days", from_date: date, to_date: date, reason: "Malade" });
  must(await survA.from("justifications").insert(days("C", a3)), "approved days");
  const rejected = await id(survA.from("justifications").insert(days("D", a3)), "to reject");
  must(await survA.from("justifications").update({ status: "rejected", review_note: "Illisible" }).eq("id", rejected), "reject");
  must(await parents.E.client.from("justifications").insert(days("E", a3)), "pending (parent)");
  must(await survA.from("justifications").insert({ ...days("F", a3), kind: "mark", session_id: sessions[a3] }), "approved mark");
  must(await parents.P.client.from("justifications").insert(days("P", L6)), "pending late (parent)");

  // --- Helpers ---------------------------------------------------------------------------------------
  const run = async (day) => must(await admin.rpc("run_daily_alerts", { p_today: day }), `run ${day}`);
  const events = (kid, type) => admin.from("alert_events").select("*").eq("student_id", kids[kid]).eq("type", type).order("period_end");
  const told = (who, type) => admin.from("notifications").select("student_id, data").eq("recipient_id", who.id).eq("type", type);
  const setRule = (type, change) => admin.from("alert_rules").update(change).eq("school_id", A.id).eq("type", type);
  const setModule = (enabled) => admin.from("school_modules").upsert({ school_id: A.id, module_key: "alerts", enabled }, { onConflict: "school_id,module_key" });
  const allEvents = async () => (await admin.from("alert_events").select("id").in("student_id", Object.values(kids))).data.length;

  // Lateness is checked in its own part below: off until then.
  must(await setRule("repeated_lateness", { enabled: false }), "lateness off");

  // --- Module off (Basic plan), then rule off: nothing ---------------------------------------------------
  await run(P);
  check("[P8 daily alerts] alerts module off (Basic): nothing is checked", (await allEvents()) === 0);
  must(await setModule(true), "module on");
  must(await setRule("unjustified_absences", { enabled: false }), "rule off");
  await run(P);
  check("[P8 daily alerts] module on but the rule switched off: nothing", (await allEvents()) === 0);
  must(await setRule("unjustified_absences", { enabled: true }), "rule on");
  must(await admin.from("school_modules").insert({ school_id: A.id, module_key: "attendance", enabled: false }), "attendance off");
  await run(P);
  check("[P8 daily alerts] attendance module off: nothing", (await allEvents()) === 0);
  must(await admin.from("school_modules").delete().eq("school_id", A.id).eq("module_key", "attendance"), "attendance back");

  // --- Unjustified absences (default: 3 days, parents + surveillance) -----------------------------------
  await run(P);
  await rows("[P8 daily alerts] 3 days with an unjustified absence → one alert for the month", events("A", "unjustified_absences"), (r) =>
    r.length === 1 && r[0].count === 3 && r[0].period_start === monthStart(P) && r[0].period_end === P);
  await rows("[P8 daily alerts] 2 days only → no alert", events("B", "unjustified_absences"), 0);
  await rows("[P8 daily alerts] one of the 3 days covered by an APPROVED justification → no alert", events("C", "unjustified_absences"), 0);
  await rows("[P8 daily alerts] a REJECTED justification excuses nothing → alert", events("D", "unjustified_absences"), 1);
  await rows("[P8 daily alerts] a PENDING justification sent within 7 days excuses → no alert", events("E", "unjustified_absences"), 0);
  await rows("[P8 daily alerts] an approved justification of that very mark excuses → no alert", events("F", "unjustified_absences"), 0);

  await rows("[P8 daily alerts] the parent is told (month + days)", told(parents.A, "unjustified_absences"), (r) =>
    r.length === 1 && r[0].student_id === kids.A && r[0].data.month === P.slice(0, 7) && r[0].data.days === 3);
  await rows("[P8 daily alerts] …and can read it themselves", parents.A.client.from("notifications").select("id").eq("type", "unjustified_absences"), 1);
  await rows("[P8 daily alerts] a parent without their own password yet is not told", told(parents.A2, "unjustified_absences"), 0);
  await rows("[P8 daily alerts] the surveillant is told (both students)", told({ id: fx.users.survA.id }, "unjustified_absences"), (r) =>
    r.length === 2 && new Set(r.map((n) => n.student_id)).size === 2);
  await rows("[P8 daily alerts] a custom role that manages attendance counts as surveillance", told(officer, "unjustified_absences"), 2);
  await rows("[P8 daily alerts] a deactivated surveillant is not told", told(survOff, "unjustified_absences"), 0);
  await rows("[P8 daily alerts] the director (not chosen for this rule) is not told", told({ id: fx.users.dirA.id }, "unjustified_absences"), 0);
  await rows("[P8 daily alerts] staff without attendance.manage are not told", told({ id: fx.users.mgrA.id }, "unjustified_absences"), 0);
  await rows("[P8 daily alerts] parents of students without an alert are not told", told(parents.B, "unjustified_absences"), 0);

  await run(P);
  await rows("[P8 daily alerts] running again the same day tells nothing twice", told(parents.A, "unjustified_absences"), 1);
  mark(a4, "A", "absent"); // the whole day is saved again: other marks of a4 stay
  await save(a4);
  await run(P);
  await rows("[P8 daily alerts] a 4th day the same month: still once per month", events("A", "unjustified_absences"), 1);

  // --- Repeated lateness (3 in 14 days), told to parents + director --------------------------------------
  must(await setRule("repeated_lateness", { enabled: true, recipients: ["parents", "director"] }), "lateness on");
  await run(L2);
  await rows("[P8 daily alerts] 2 lates → no alert yet", events("L", "repeated_lateness"), 0);
  await run(L3);
  await rows("[P8 daily alerts] the 3rd late → alert (count, first late → alert day)", events("L", "repeated_lateness"), (r) =>
    r.length === 1 && r[0].count === 3 && r[0].period_start === L1 && r[0].period_end === L3);
  await rows("[P8 daily alerts] the parent is told (count, window, from, to)", told(parents.L, "repeated_lateness"), (r) =>
    r.length === 1 && r[0].data.count === 3 && r[0].data.window_days === 14 && r[0].data.from === L1 && r[0].data.to === L3);
  await rows("[P8 daily alerts] the director chosen for this rule is told", told({ id: fx.users.dirA.id }, "repeated_lateness"), 1);
  await rows("[P8 daily alerts] …not a director who has not set their own password", told({ id: pendA.id }, "repeated_lateness"), 0);
  await rows("[P8 daily alerts] …and not the surveillant (not chosen)", told({ id: fx.users.survA.id }, "repeated_lateness"), 0);
  await run(L5);
  await rows("[P8 daily alerts] 2 new lates after the alert → nothing (old lates never count twice)", events("L", "repeated_lateness"), 1);
  await run(L6);
  await rows("[P8 daily alerts] 3 new lates after the alert → a second alert", events("L", "repeated_lateness"), (r) =>
    r.length === 2 && r[1].count === 3 && r[1].period_start === L4 && r[1].period_end === L6);

  // --- A pending justification excuses for 7 days after it was sent, then no more -----------------------
  await rows("[P8 daily alerts] pending justification sent today: the late it covers does not count", events("P", "repeated_lateness"), 0);
  await run(addDays(today, 7));
  await rows("[P8 daily alerts] …7 days after sending, still unreviewed: still excused", events("P", "repeated_lateness"), 0);
  await run(addDays(today, 8));
  await rows("[P8 daily alerts] …8 days after sending, still unreviewed: counts again → alert", events("P", "repeated_lateness"), (r) =>
    r.length === 1 && r[0].count === 3);
  await rows("[P8 daily alerts] …and its parent is told", told(parents.P, "repeated_lateness"), 1);
  if (monthStart(addDays(today, 8)) === monthStart(P)) {
    await rows("[P8 daily alerts] the same expiry applies to absences (pending sent today, checked 8 days later)", events("E", "unjustified_absences"), 1);
  } else {
    skip("[P8 daily alerts] the same expiry applies to absences", "today + 8 is in another month than the absences");
  }

  // --- Nobody reads the alert log or runs the check through the API --------------------------------------
  for (const [who, client] of [["the director", dirA], ["the surveillant", survA], ["a parent", parents.A.client]]) {
    const q = await client.from("alert_events").select("id").limit(1);
    check(`[P8 daily alerts] ${who} cannot read the alert log`, Boolean(q.error) || q.data?.length === 0, q.error?.code ?? `${q.data?.length} row(s)`);
  }
  const call = await dirA.rpc("run_daily_alerts", { p_today: today });
  check("[P8 daily alerts] a signed-in user cannot run the check", call.error?.code === "42501", call.error?.code ?? "ACCEPTED!");

  // --- Clean up ------------------------------------------------------------------------------------------
  await admin.from("school_modules").delete().eq("school_id", A.id).eq("module_key", "alerts");
  await admin.from("alert_rules").update({ enabled: true, threshold: 3, window_days: 14, recipients: ["parents"] }).eq("school_id", A.id).eq("type", "repeated_lateness");
  await admin.from("alert_rules").update({ enabled: true, threshold: 3, recipients: ["parents", "surveillance"] }).eq("school_id", A.id).eq("type", "unjustified_absences");
  const staffIds = [fx.users.survA.id, fx.users.dirA.id, fx.users.mgrA.id, pendA.id];
  await admin.from("notifications").delete().in("student_id", Object.values(kids));
  await admin.from("notifications").delete().in("recipient_id", [...created, ...staffIds]).in("type", ["unjustified_absences", "repeated_lateness"]);
  await admin.from("attendance_sessions").delete().eq("class_id", klass);
  await admin.from("absence_notices").delete().in("student_id", Object.values(kids));
  await admin.from("justifications").delete().in("student_id", Object.values(kids));
  await admin.from("student_guardians").delete().in("student_id", Object.values(kids));
  await admin.from("guardians").delete().in("profile_id", created);
  await admin.from("students").delete().in("id", Object.values(kids)); // enrollments, events go with them
  await admin.from("lessons").delete().in("id", Object.values(lessons));
  await admin.from("teacher_subjects").delete().eq("subject_id", subject);
  await admin.from("classes").delete().eq("id", klass);
  await admin.from("time_slots").delete().in("id", slots);
  for (const dow of addedDays) await admin.from("school_days").delete().eq("academic_year_id", year.id).eq("day_of_week", dow);
  if (ownYear) await admin.from("academic_years").delete().eq("id", year.id);
  await admin.from("levels").delete().eq("id", level);
  await admin.from("subjects").delete().eq("id", subject);
  // The accounts (and the officer role) go with the fixtures.
}
