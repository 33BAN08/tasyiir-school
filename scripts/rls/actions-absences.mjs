// Phase 7 step 3a: staff attendance — Server Action saveAttendanceFor (correct
// or take a roll call on a day up to today, attendance.manage) and the pages
// /absences (one class, one day; attendance.view) and /absences/[lesson].
import { randomBytes } from "node:crypto";

import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";
import { randomMobile } from "./phase5-guardians.mjs";

const FILE = "src/lib/attendance/actions.ts";
const DAY = 86_400_000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const isoDow = (t) => ((new Date(t).getUTCDay() + 6) % 7) + 1;

export async function absencesActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const tch = fx.users.tchA.id;
  const id = async (query) => (await query.select("id").single()).data.id;
  const now = Date.now(); // Morocco is UTC+0: the UTC date is the school's date
  let pastTime = now - DAY;
  while (isoDow(pastTime) === 7) pastTime -= DAY;
  const past = iso(pastTime);
  const pastDow = isoDow(pastTime);

  const email = `rls-test+${fx.run}-abpar@example.com`;
  const password = `${randomBytes(12).toString("base64url")}a1`;
  const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  fx.createdUserIds.push(created.user.id);
  await admin.from("profiles").insert({ id: created.user.id, school_id: A.id, role_id: A.roles.parent, full_name: "RLS abpar", must_change_password: false });
  const { data: tchState } = await admin.from("profiles").select("must_change_password, deactivated_at").eq("id", tch).single();
  await admin.from("profiles").update({ must_change_password: false, deactivated_at: null }).eq("id", tch);

  // The year containing today (reuse, else create), Monday–Saturday 22:00, one class, three students.
  const today = iso(now);
  const { data: existing } = await admin.from("academic_years").select("id, start_date").eq("school_id", A.id)
    .lte("start_date", past).gte("end_date", today).maybeSingle();
  const ownYear = !existing;
  const year = existing?.id ?? await id(admin.from("academic_years").insert({
    school_id: A.id, label: "AB-annee", start_date: iso(now - 60 * DAY), end_date: iso(now + 200 * DAY), is_current: false,
  }));
  const yearStart = Date.parse(`${existing?.start_date ?? iso(now - 60 * DAY)}T00:00:00Z`);
  let outsideTime = yearStart - DAY;
  while (isoDow(outsideTime) !== pastDow) outsideTime -= DAY;
  const { data: daysBefore } = await admin.from("school_days").select("day_of_week").eq("academic_year_id", year);
  const addedDays = [1, 2, 3, 4, 5, 6].filter((d) => !(daysBefore ?? []).some((x) => x.day_of_week === d));
  if (addedDays.length) await admin.from("school_days").insert(addedDays.map((d) => ({ school_id: A.id, academic_year_id: year, day_of_week: d })));
  const slotOf = {};
  for (let d = 1; d <= 6; d++) {
    slotOf[d] = await id(admin.from("time_slots").insert({
      school_id: A.id, academic_year_id: year, day_of_week: d, start_time: "22:00", end_time: "22:30", kind: "lesson",
    }));
  }
  const level = await id(admin.from("levels").insert({ school_id: A.id, name: "AB-Niveau", cycle: "college" }));
  const c1 = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name: "AB-1" }));
  const subject = await id(admin.from("subjects").insert({ school_id: A.id, name: "AB-Arabe" }));
  const dirA = await signIn(fx.users.dirA);
  await dirA.from("teacher_subjects").insert({ school_id: A.id, teacher_id: tch, subject_id: subject });
  const lessonOf = {};
  for (let d = 1; d <= 6; d++) {
    lessonOf[d] = await id(admin.from("lessons").insert({
      school_id: A.id, academic_year_id: year, time_slot_id: slotOf[d], class_id: c1, subject_id: subject, teacher_id: tch,
    }));
  }
  const kids = [];
  for (const name of ["ABAlpha", "ABBeta", "ABGamma"]) {
    const s = await id(admin.from("students").insert({ school_id: A.id, first_name: "Kid", last_name: name, birth_date: "2014-01-01", gender: "male" }));
    await admin.from("student_enrollments").insert({ school_id: A.id, student_id: s, academic_year_id: year, class_id: c1 });
    kids.push(s);
  }
  const guardian = await id(admin.from("guardians").insert({ school_id: A.id, last_name: "AB", first_name: "Parent", phone: randomMobile(), profile_id: created.user.id }));

  const cookies = {};
  for (const who of ["survA", "dirA", "audA", "tchA", "dirB"]) cookies[who] = await sessionCookies(fx.users[who]);
  cookies.parent = await sessionCookies({ email, password });
  const PAGE = `/fr/absences/${lessonOf[pastDow]}?date=${past}`;
  const correctId = actionId(FILE, "saveAttendanceFor");
  const correct = (who, lesson, date, marks) => callAction(baseUrl, { id: correctId, path: PAGE, args: [lesson, date, marks], cookies: cookies[who] });
  const expect = async (label, promise, wanted) => {
    const r = await promise;
    const got = r.ok ? "ok" : r.error;
    check(`[P7 staff] ${label}`, got === wanted, got);
    return r;
  };
  const page = async (who, path) => {
    const res = await fetch(new URL(path, baseUrl), { headers: { cookie: cookies[who] }, redirect: "manual" });
    const html = res.status === 200 ? await res.text() : "";
    const streamed = html.match(/NEXT_REDIRECT;\w+;([^;]+);/)?.[1];
    return { status: res.status, redirect: streamed ?? res.headers.get("location") ?? "", html: streamed ? "" : html };
  };
  const absent = (studentId) => ({ studentId, status: "absent", minutesLate: null });

  // --- Corrections ------------------------------------------------------------------------------
  const first = await expect("the surveillant takes a forgotten roll call of a past day", correct("survA", lessonOf[pastDow], past, [absent(kids[0])]), "ok");
  check("[P7 staff] …with the time it was taken", /^\d{2}:\d{2}$/.test(first.data?.takenAt ?? ""), JSON.stringify(first.data));
  await expect("the director corrects it", correct("dirA", lessonOf[pastDow], past, [absent(kids[0]), { studentId: kids[1], status: "late", minutesLate: 12 }]), "ok");
  const { data: marks } = await admin.from("attendance_marks").select("student_id, status, minutes_late")
    .eq("school_id", A.id).in("student_id", kids);
  check("[P7 staff] …saved: one absent, one late 12 min", marks?.length === 2 && marks.some((m) => m.status === "late" && m.minutes_late === 12), JSON.stringify(marks));
  await expect("a future day → future", correct("survA", lessonOf[pastDow], iso(pastTime + 7 * DAY), []), "future");
  await expect("not the lesson's weekday → notToday", correct("survA", lessonOf[pastDow], iso(pastTime - DAY), []), "notToday");
  await expect("outside the lesson's year → outsideYear", correct("survA", lessonOf[pastDow], iso(outsideTime), []), "outsideYear");
  await expect("not a date → invalid", correct("survA", lessonOf[pastDow], "hier", []), "invalid");
  await expect("staff without attendance.manage → forbidden", correct("audA", lessonOf[pastDow], past, []), "forbidden");
  await expect("a teacher (staff correction) → forbidden", correct("tchA", lessonOf[pastDow], past, []), "forbidden");
  await expect("another school's director → notFound", correct("dirB", lessonOf[pastDow], past, []), "notFound");

  // --- Pages --------------------------------------------------------------------------------------
  const day = await page("survA", `/fr/absences?date=${past}&class=${c1}`);
  check("[P7 staff] the day view: the lesson, who took it, who was absent / late",
    day.status === 200 && day.html.includes("AB-Arabe") && day.html.includes("Appel fait par la surveillance")
      && day.html.includes("ABAlpha") && day.html.includes("Retard 12 min") && !day.html.includes("ABGamma"));
  check("[P7 staff] …manage: a Correct link to the roll call of that day",
    day.html.includes(`/fr/absences/${lessonOf[pastDow]}?date=${past}`));
  const future = await page("survA", `/fr/absences?date=${iso(now + 30 * DAY)}&class=${c1}`);
  check("[P7 staff] a later day in the URL shows today instead", future.status === 200 && future.html.includes("Aujourd"));
  const fix = await page("survA", PAGE);
  check("[P7 staff] the correction page lists the class with today's marks", fix.status === 200 && fix.html.includes("ABGamma") && fix.html.includes("Correction par la surveillance"));
  for (const [who, home] of [["tchA", "/fr/dashboard"], ["audA", "/fr/dashboard"], ["parent", "/fr/portal"]]) {
    check(`[P7 staff] ${who}: no access to Absences`, (await page(who, `/fr/absences?date=${past}`)).redirect === home);
    check(`[P7 staff] ${who}: no access to a correction`, (await page(who, PAGE)).redirect === home);
  }
  // --- 3b: totals and the student page ----------------------------------------------------------
  const totals = await page("survA", `/fr/absences?view=totals&class=${c1}&period=year`);
  check("[P7 staff] totals since the start of the year: absences with hours, late arrivals with minutes",
    totals.status === 200 && totals.html.includes("1 absence · 0 h 30") && totals.html.includes("1 retard · 12 min") && totals.html.includes("ABGamma"),
    String(totals.status));
  check("[P7 staff] …the most absent student comes first",
    totals.html.indexOf("ABAlpha") > 0 && totals.html.indexOf("ABAlpha") < totals.html.indexOf("ABBeta") && totals.html.indexOf("ABBeta") < totals.html.indexOf("ABGamma"));
  const card = await page("survA", `/fr/students/${kids[0]}`);
  check("[P7 staff] the student page shows the year's absences and the latest one",
    card.status === 200 && card.html.includes("Absences et retards") && card.html.includes("1 absence · 0 h 30") && card.html.includes("AB-Arabe"));
  check("[P7 staff] …linking to that class's day", card.html.includes(`/fr/absences?view=day&amp;date=${past}&amp;class=${c1}`) || card.html.includes(`/fr/absences?view=day&date=${past}&class=${c1}`));
  check("[P7 staff] a teacher cannot open the totals", (await page("tchA", `/fr/absences?view=totals&class=${c1}`)).redirect === "/fr/dashboard");

  const other = await page("dirB", `/fr/absences?date=${past}&class=${c1}`);
  check("[P7 staff] another school's director sees nothing of the class", !other.html.includes("ABAlpha") && !other.html.includes("AB-1"));

  // --- Clean up -----------------------------------------------------------------------------------
  await admin.from("attendance_sessions").delete().eq("class_id", c1);
  await admin.from("guardians").delete().eq("id", guardian);
  await admin.from("student_enrollments").delete().in("student_id", kids);
  await admin.from("students").delete().in("id", kids);
  await admin.from("lessons").delete().eq("class_id", c1);
  await admin.from("teacher_subjects").delete().eq("subject_id", subject);
  await admin.from("classes").delete().eq("id", c1);
  await admin.from("time_slots").delete().in("id", Object.values(slotOf));
  if (addedDays.length) await admin.from("school_days").delete().eq("academic_year_id", year).in("day_of_week", addedDays);
  if (ownYear) await admin.from("academic_years").delete().eq("id", year);
  await admin.from("levels").delete().eq("id", level);
  await admin.from("subjects").delete().eq("id", subject);
  await admin.from("profiles").update(tchState).eq("id", tch);
}
