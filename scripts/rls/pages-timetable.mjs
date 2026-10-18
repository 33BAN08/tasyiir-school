// Phase 6 step 6 pages, fetched over HTTP as real users: a teacher's own week
// (/my-timetable) and a child's class week in the parent portal
// (/portal/timetable). Read-only: no add / edit / move control is rendered,
// and nothing beyond the user's own lessons reaches the page (HTML and the
// data sent to the browser), no teacher email either.
import { randomBytes } from "node:crypto";

import { sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";
import { randomMobile } from "./phase5-guardians.mjs";

export async function timetablePages({ fx, baseUrl }) {
  const A = fx.schools.a;
  const tch = fx.users.tchA.id;
  const id = async (query) => (await query.select("id").single()).data.id;
  const page = async (cookies, path) => {
    const res = await fetch(new URL(path, baseUrl), { headers: { cookie: cookies }, redirect: "manual" });
    const html = res.status === 200 ? await res.text() : "";
    // A page that redirects while streaming answers 200 with Next's redirect marker.
    const streamed = html.match(/NEXT_REDIRECT;\w+;([^;]+);/)?.[1];
    return { status: res.status, redirect: streamed ?? res.headers.get("location") ?? "", html: streamed ? "" : html };
  };

  // --- Accounts: a second teacher, a parent (own password set) ---------------------------------
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
  // Earlier suites may leave the fixture teacher with a forced password change
  // or deactivated: give them a normal account for these pages, then put it back.
  const { data: tchState } = await admin.from("profiles").select("must_change_password, deactivated_at").eq("id", tch).single();
  await admin.from("profiles").update({ must_change_password: false, deactivated_at: null }).eq("id", tch);
  const tch2 = await account("teacher", "lptch2");
  const parent = await account("parent", "lppar");

  // --- A current year (2054): Monday 08:00 and 09:00, two classes ------------------------------
  const currentBefore = (await admin.from("academic_years").select("id").eq("school_id", A.id).eq("is_current", true).maybeSingle()).data?.id;
  const year = await id(admin.from("academic_years").insert({
    school_id: A.id, label: "2054-2055", start_date: "2054-09-01", end_date: "2055-06-30", is_current: true,
  }));
  await admin.from("school_days").insert({ school_id: A.id, academic_year_id: year, day_of_week: 1 });
  const slot = (start, end) => id(admin.from("time_slots").insert({
    school_id: A.id, academic_year_id: year, day_of_week: 1, start_time: start, end_time: end, kind: "lesson",
  }));
  const s8 = await slot("08:00", "09:00");
  const s9 = await slot("09:00", "10:00");
  const level = await id(admin.from("levels").insert({ school_id: A.id, name: "LP-Niveau", cycle: "college" }));
  const c1 = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name: "LP-1" }));
  const c2 = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name: "LP-2" }));
  const arabe = await id(admin.from("subjects").insert({ school_id: A.id, name: "LP-Arabe" }));
  const maths = await id(admin.from("subjects").insert({ school_id: A.id, name: "LP-Maths" }));
  const room = await id(admin.from("rooms").insert({ school_id: A.id, name: "LP-Salle", capacity: 30 }));
  const dirA = await signIn(fx.users.dirA);
  await dirA.from("teacher_subjects").insert([
    { school_id: A.id, teacher_id: tch, subject_id: arabe },
    { school_id: A.id, teacher_id: tch2.id, subject_id: maths },
  ]);
  const lesson = (classId, slotId, subjectId, teacherId, roomId = null) => admin.from("lessons").insert({
    school_id: A.id, academic_year_id: year, time_slot_id: slotId, class_id: classId, subject_id: subjectId, teacher_id: teacherId, room_id: roomId,
  });
  await lesson(c1, s8, arabe, tch, room); // the teacher's lesson, in the child's class
  await lesson(c2, s9, maths, tch2.id); //  another teacher, another class

  // The parent's child is in LP-1; another student (not theirs) is in LP-2.
  const student = (name, classId) =>
    id(admin.from("students").insert({ school_id: A.id, first_name: "Kid", last_name: name, birth_date: "2014-01-01", gender: "male" }))
      .then(async (s) => {
        await admin.from("student_enrollments").insert({ school_id: A.id, student_id: s, academic_year_id: year, class_id: classId });
        return s;
      });
  const child = await student("LPChild", c1);
  const stranger = await student("LPStranger", c2);
  const guardian = await id(admin.from("guardians").insert({
    school_id: A.id, last_name: "LP", first_name: "Parent", phone: randomMobile(), profile_id: parent.id,
  }));
  await admin.from("student_guardians").insert({ school_id: A.id, student_id: child, guardian_id: guardian, relation: "father" });

  const cookies = {
    tchA: await sessionCookies(fx.users.tchA),
    dirA: await sessionCookies(fx.users.dirA),
    parent: await sessionCookies(parent),
  };
  const { data: teacherRow } = await admin.from("profiles").select("full_name").eq("id", tch).single();
  // The HTML also carries the message catalogue: look for RENDERED controls only.
  const EDIT_MARKERS = ['aria-label="Ajouter une séance', 'aria-label="Modifier la séance', 'draggable="true"'];
  const readOnly = (html) => EDIT_MARKERS.filter((m) => html.includes(m));

  // --- Teacher: own week only ---------------------------------------------------------------------
  const mine = await page(cookies.tchA, "/fr/my-timetable");
  check("[P6 pages] teacher opens Mon emploi du temps", mine.status === 200, String(mine.status));
  check("[P6 pages] …shows their lesson (subject, class, room)",
    mine.html.includes("LP-Arabe") && mine.html.includes("LP-1") && mine.html.includes("LP-Salle"));
  check("[P6 pages] …nothing of another teacher's lessons", !mine.html.includes("LP-Maths") && !mine.html.includes("LP-2"));
  check("[P6 pages] …read-only (no add / edit / drag)", readOnly(mine.html).length === 0, readOnly(mine.html).join(", "));
  const ar = await page(cookies.tchA, "/ar/my-timetable");
  check("[P6 pages] …in Arabic too", ar.status === 200 && ar.html.includes("LP-Arabe"), String(ar.status));
  const dirMine = await page(cookies.dirA, "/fr/my-timetable");
  check("[P6 pages] a director is sent to their dashboard", dirMine.redirect === "/fr/dashboard", dirMine.redirect);
  // Control: the staff timetable of the same class does render those controls, so the checks above can fail.
  const staff = await page(cookies.dirA, `/fr/timetable?class=${c1}`);
  check("[P6 pages] (control) the director's timetable has edit controls", readOnly(staff.html).length === 3, readOnly(staff.html).join(", "));

  // --- Parent: the child's class week -------------------------------------------------------------
  const portal = await page(cookies.parent, "/fr/portal/timetable");
  check("[P6 pages] parent opens the child's timetable", portal.status === 200, String(portal.status));
  check("[P6 pages] …the class's lesson with the teacher's name and the room",
    portal.html.includes("LP-Arabe") && portal.html.includes(teacherRow.full_name) && portal.html.includes("LP-Salle"));
  check("[P6 pages] …nothing of another class", !portal.html.includes("LP-Maths") && !portal.html.includes("LP-2"));
  check("[P6 pages] …no teacher email", !portal.html.includes(fx.users.tchA.email) && !portal.html.includes(tch2.email));
  check("[P6 pages] …read-only", readOnly(portal.html).length === 0, readOnly(portal.html).join(", "));
  const other = await page(cookies.parent, `/fr/portal/timetable?child=${stranger}`);
  check("[P6 pages] another family's child in the URL → still only their own child",
    other.status === 200 && !other.html.includes("LP-Maths") && !other.html.includes("LPStranger") && other.html.includes("LP-Arabe"));
  const home = await page(cookies.parent, "/fr/portal");
  check("[P6 pages] portal home links to the timetable", home.html.includes(`/fr/portal/timetable?child=${child}`));
  const staffPage = await page(cookies.parent, "/fr/timetable");
  check("[P6 pages] parent cannot open the staff timetable", staffPage.redirect === "/fr/portal", staffPage.redirect);
  const tchPortal = await page(cookies.tchA, "/fr/portal/timetable");
  check("[P6 pages] teacher cannot open the parent portal", tchPortal.redirect === "/fr/dashboard", tchPortal.redirect);

  // No class this year → a clear message.
  await admin.from("student_enrollments").delete().eq("student_id", child);
  const noClass = await page(cookies.parent, "/fr/portal/timetable");
  check("[P6 pages] child without a class this year → clear message", noClass.html.includes("pas de classe cette année"));

  // Clean up.
  await admin.from("student_guardians").delete().eq("guardian_id", guardian);
  await admin.from("guardians").delete().eq("id", guardian);
  await admin.from("student_enrollments").delete().eq("academic_year_id", year);
  await admin.from("students").delete().in("id", [child, stranger]);
  await admin.from("lessons").delete().eq("academic_year_id", year);
  await admin.from("teacher_subjects").delete().in("subject_id", [arabe, maths]);
  await admin.from("classes").delete().in("id", [c1, c2]);
  await admin.from("academic_years").delete().eq("id", year);
  if (currentBefore) await admin.from("academic_years").update({ is_current: true }).eq("id", currentBefore);
  await admin.from("levels").delete().eq("id", level);
  await admin.from("subjects").delete().in("id", [arabe, maths]);
  await admin.from("rooms").delete().eq("id", room);
  await admin.from("profiles").update(tchState).eq("id", tch);
}
