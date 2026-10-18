// Phase 7 step 2: the teacher's roll call — Server Action saveRollCall and the
// pages /attendance and /attendance/[lesson], called over HTTP as real users.
// "Today" is the database's (Africa/Casablanca). Lessons are Monday–Saturday:
// on Sundays the checks that save TODAY's roll call are skipped (listed as SKIP).
import { randomBytes } from "node:crypto";

import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check, skip } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";
import { randomMobile } from "./phase5-guardians.mjs";

const FILE = "src/lib/attendance/actions.ts";
const DAY = 86_400_000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const isoDow = (t) => ((new Date(t).getUTCDay() + 6) % 7) + 1;

export async function rollCallActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const tch = fx.users.tchA.id;
  const id = async (query) => (await query.select("id").single()).data.id;
  const now = Date.now();
  const todayDow = isoDow(now); // Morocco is UTC+0: the UTC date is the school's date

  // Accounts: a second teacher, a parent. The fixture teacher gets a normal account for this suite.
  const account = async (roleKey, name) => {
    const email = `rls-test+${fx.run}-${name}@example.com`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    fx.createdUserIds.push(data.user.id);
    await admin.from("profiles").insert({
      id: data.user.id, school_id: A.id, role_id: A.roles[roleKey], full_name: `RLS ${name}`,
      email: roleKey === "parent" ? null : email, must_change_password: false,
    });
    return { id: data.user.id, email, password };
  };
  const tch2 = await account("teacher", "rctch2");
  const parent = await account("parent", "rcpar");
  const { data: tchState } = await admin.from("profiles").select("must_change_password, deactivated_at").eq("id", tch).single();
  await admin.from("profiles").update({ must_change_password: false, deactivated_at: null }).eq("id", tch);

  // The year containing today (reuse the one an earlier suite left, else create), Monday–Saturday 21:30.
  const today = iso(now);
  const { data: existing } = await admin.from("academic_years").select("id").eq("school_id", A.id)
    .lte("start_date", today).gte("end_date", today).maybeSingle();
  const ownYear = !existing;
  const year = existing?.id ?? await id(admin.from("academic_years").insert({
    school_id: A.id, label: "RC-annee", start_date: iso(now - 60 * DAY), end_date: iso(now + 200 * DAY), is_current: false,
  }));
  // The roll call is for the CURRENT year: make this one current, put the previous one back at the end.
  const { data: currentBefore } = await admin.from("academic_years").select("id").eq("school_id", A.id).eq("is_current", true).maybeSingle();
  await admin.from("academic_years").update({ is_current: true }).eq("id", year);
  const { data: daysBefore } = await admin.from("school_days").select("day_of_week").eq("academic_year_id", year);
  const addedDays = [1, 2, 3, 4, 5, 6].filter((d) => !(daysBefore ?? []).some((x) => x.day_of_week === d));
  if (addedDays.length) await admin.from("school_days").insert(addedDays.map((d) => ({ school_id: A.id, academic_year_id: year, day_of_week: d })));
  const slotOf = {};
  for (let d = 1; d <= 6; d++) {
    slotOf[d] = await id(admin.from("time_slots").insert({
      school_id: A.id, academic_year_id: year, day_of_week: d, start_time: "21:30", end_time: "22:00", kind: "lesson",
    }));
  }
  const level = await id(admin.from("levels").insert({ school_id: A.id, name: "RC-Niveau", cycle: "college" }));
  const c1 = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name: "RC-1" }));
  const c2 = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name: "RC-2" }));
  const subject = await id(admin.from("subjects").insert({ school_id: A.id, name: "RC-Arabe" }));
  const dirA = await signIn(fx.users.dirA);
  await dirA.from("teacher_subjects").insert([
    { school_id: A.id, teacher_id: tch, subject_id: subject },
    { school_id: A.id, teacher_id: tch2.id, subject_id: subject },
  ]);
  const lessonOf = {};
  for (let d = 1; d <= 6; d++) {
    lessonOf[d] = await id(admin.from("lessons").insert({
      school_id: A.id, academic_year_id: year, time_slot_id: slotOf[d], class_id: c1, subject_id: subject, teacher_id: tch,
    }));
  }
  const kid = async (name, classId) => {
    const s = await id(admin.from("students").insert({ school_id: A.id, first_name: "Kid", last_name: name, birth_date: "2014-01-01", gender: "male" }));
    await admin.from("student_enrollments").insert({ school_id: A.id, student_id: s, academic_year_id: year, class_id: classId });
    return s;
  };
  const k1 = await kid("RCAlpha", c1);
  const k2 = await kid("RCBeta", c1);
  const outsider = await kid("RCGamma", c2);
  const guardian = await id(admin.from("guardians").insert({ school_id: A.id, last_name: "RC", first_name: "Parent", phone: randomMobile(), profile_id: parent.id }));
  await admin.from("student_guardians").insert({ school_id: A.id, student_id: k1, guardian_id: guardian, relation: "father" });

  const cookies = {
    tchA: await sessionCookies(fx.users.tchA),
    tch2: await sessionCookies(tch2),
    survA: await sessionCookies(fx.users.survA),
    dirA: await sessionCookies(fx.users.dirA),
    dirB: await sessionCookies(fx.users.dirB),
    parent: await sessionCookies(parent),
  };
  const notTodayDow = todayDow === 1 ? 2 : 1;
  const PAGE = `/fr/attendance/${lessonOf[notTodayDow]}`;
  const saveId = actionId(FILE, "saveRollCall");
  const save = (who, lesson, marks) => callAction(baseUrl, { id: saveId, path: PAGE, args: [lesson, marks], cookies: cookies[who] });
  const expect = async (label, promise, wanted) => {
    const r = await promise;
    const got = r.ok ? "ok" : r.error;
    check(`[P7 roll call] ${label}`, got === wanted, got);
    return r;
  };
  const page = async (who, path) => {
    const res = await fetch(new URL(path, baseUrl), { headers: { cookie: cookies[who] }, redirect: "manual" });
    const html = res.status === 200 ? await res.text() : "";
    const streamed = html.match(/NEXT_REDIRECT;\w+;([^;]+);/)?.[1];
    return { status: res.status, redirect: streamed ?? res.headers.get("location") ?? "", html: streamed ? "" : html };
  };
  const absent = (studentId) => ({ studentId, status: "absent", minutesLate: null });

  // --- The action refuses ---------------------------------------------------------------------
  await expect("not a lesson id → notFound", save("tchA", "nope", []), "notFound");
  await expect("the same student twice → invalid", save("tchA", lessonOf[notTodayDow], [absent(k1), absent(k1)]), "invalid");
  await expect("late over 240 minutes → minutes", save("tchA", lessonOf[notTodayDow], [{ studentId: k1, status: "late", minutesLate: 300 }]), "minutes");
  await expect("absent with minutes → invalid", save("tchA", lessonOf[notTodayDow], [{ studentId: k1, status: "absent", minutesLate: 5 }]), "invalid");
  await expect("a lesson that is not today → notToday", save("tchA", lessonOf[notTodayDow], [absent(k1)]), "notToday");
  await expect("a parent → forbidden", save("parent", lessonOf[notTodayDow], []), "forbidden");
  await expect("another school's director → notFound", save("dirB", lessonOf[notTodayDow], []), "notFound");

  // --- Pages ------------------------------------------------------------------------------------
  const list = await page("tchA", "/fr/attendance");
  check("[P7 roll call] the teacher opens Appel", list.status === 200, String(list.status));
  if (todayDow === 7) check("[P7 roll call] …on Sunday: no lessons today", list.html.includes("Pas de cours aujourd"));
  else check("[P7 roll call] …today's lesson is listed, to do", list.html.includes("RC-Arabe") && list.html.includes("RC-1") && list.html.includes("À faire"));
  const notToday = await page("tchA", `/fr/attendance/${lessonOf[notTodayDow]}`);
  check("[P7 roll call] another day's lesson: clear message, no roll call",
    notToday.status === 200 && notToday.html.includes("pas lieu aujourd") && !notToday.html.includes("RCAlpha"));
  const others = await page("tch2", `/fr/attendance/${lessonOf[notTodayDow]}`);
  // notFound() while streaming answers 200 with Next's not-found marker.
  check("[P7 roll call] another teacher's lesson → not found, none of its students",
    (others.status === 404 || others.html.includes("NEXT_HTTP_ERROR_FALLBACK;404")) && !others.html.includes("RCAlpha"), String(others.status));
  check("[P7 roll call] a director is sent to their dashboard", (await page("dirA", "/fr/attendance")).redirect === "/fr/dashboard");
  check("[P7 roll call] a parent is sent to the portal", (await page("parent", "/fr/attendance")).redirect === "/fr/portal");

  // --- Today's roll call (Monday–Saturday) ------------------------------------------------------
  const todayChecks = [
    "teacher saves today's roll call (time HH:MM)", "…saving again records the change time",
    "a student of another class → studentNotInClass", "another teacher → forbidden",
    "the surveillant may take it too", "the roll call page shows the class and 'Appel fait à'",
  ];
  if (todayDow === 7) {
    for (const name of todayChecks) skip(`[P7 roll call] ${name}`, "today is Sunday (no lessons): runs Monday to Saturday");
  } else {
    const lesson = lessonOf[todayDow];
    const first = await expect(todayChecks[0], save("tchA", lesson, [absent(k1), { studentId: k2, status: "late", minutesLate: null }]), "ok");
    check(`[P7 roll call] …takenAt is a time`, /^\d{2}:\d{2}$/.test(first.data?.takenAt ?? ""), JSON.stringify(first.data));
    const second = await expect(todayChecks[1], save("tchA", lesson, [absent(k1)]), "ok");
    check("[P7 roll call] …same takenAt", second.data?.takenAt === first.data?.takenAt, JSON.stringify(second.data));
    await expect(todayChecks[2], save("tchA", lesson, [absent(outsider)]), "studentNotInClass");
    await expect(todayChecks[3], save("tch2", lesson, []), "forbidden");
    await expect(todayChecks[4], save("survA", lesson, [absent(k1)]), "ok");
    const rollCall = await page("tchA", `/fr/attendance/${lesson}`);
    check(`[P7 roll call] ${todayChecks[5]}`, rollCall.html.includes("RCAlpha") && rollCall.html.includes("Appel fait à"));
  }

  // --- Clean up -----------------------------------------------------------------------------------
  await admin.from("attendance_sessions").delete().in("class_id", [c1, c2]);
  await admin.from("student_guardians").delete().eq("guardian_id", guardian);
  await admin.from("guardians").delete().eq("id", guardian);
  await admin.from("student_enrollments").delete().in("student_id", [k1, k2, outsider]);
  await admin.from("students").delete().in("id", [k1, k2, outsider]);
  await admin.from("lessons").delete().in("class_id", [c1, c2]);
  await admin.from("teacher_subjects").delete().eq("subject_id", subject);
  await admin.from("classes").delete().in("id", [c1, c2]);
  await admin.from("time_slots").delete().in("id", Object.values(slotOf));
  if (addedDays.length) await admin.from("school_days").delete().eq("academic_year_id", year).in("day_of_week", addedDays);
  if (currentBefore && currentBefore.id !== year) await admin.from("academic_years").update({ is_current: true }).eq("id", currentBefore.id);
  if (ownYear) await admin.from("academic_years").delete().eq("id", year);
  await admin.from("levels").delete().eq("id", level);
  await admin.from("subjects").delete().eq("id", subject);
  await admin.from("profiles").update(tchState).eq("id", tch);
}
