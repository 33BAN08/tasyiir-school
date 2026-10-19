// Phase 9 step 3: the remark screens and the Server Actions behind them —
// createRemark / updateRemark / deleteRemark / markRemarkRead. A teacher writes
// on students of classes they teach (/remarks, lesson page), staff with
// attendance.manage on any student (/remarks, student page); the author edits /
// deletes within 24 h, the director moderates; a parent marks "Lu" on
// /portal/remarks. Called over HTTP as real users on the page that registers each action.
import { randomBytes } from "node:crypto";

import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";
import { randomMobile } from "./phase5-guardians.mjs";

const FILE = "src/lib/remarks/actions.ts";
const DAY = 86_400_000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);

export async function remarkActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const must = (r, what) => {
    if (r.error) throw new Error(`remarkActions setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (query, what) => must(await query.select("id").single(), what).id;
  const label = (s) => `[P9 remark actions] ${s}`;

  // --- Setup: current year of A, the teacher teaches c1 only, one parent per class ---------------------
  const now = Date.now();
  const today = iso(now);
  const tch = fx.users.tchA.id;
  const { data: tchState } = await admin.from("profiles").select("must_change_password, deactivated_at").eq("id", tch).single();
  await admin.from("profiles").update({ must_change_password: false, deactivated_at: null }).eq("id", tch);

  const { data: before } = await admin.from("academic_years").select("id").eq("school_id", A.id).eq("is_current", true).maybeSingle();
  const { data: existing } = await admin.from("academic_years").select("id")
    .eq("school_id", A.id).lte("start_date", today).gte("end_date", today).maybeSingle();
  const ownYear = !existing;
  const year = existing?.id ?? await id(admin.from("academic_years").insert({
    school_id: A.id, label: "P9ra-annee", start_date: iso(now - 60 * DAY), end_date: iso(now + 200 * DAY), is_current: false,
  }), "year");
  must(await admin.from("academic_years").update({ is_current: true }).eq("id", year), "current year");
  const { data: monday } = await admin.from("school_days").select("day_of_week").eq("academic_year_id", year).eq("day_of_week", 1).maybeSingle();
  if (!monday) must(await admin.from("school_days").insert({ school_id: A.id, academic_year_id: year, day_of_week: 1 }), "day");
  const slot = await id(admin.from("time_slots").insert({
    school_id: A.id, academic_year_id: year, day_of_week: 1, start_time: "22:30", end_time: "22:40", kind: "lesson",
  }), "slot");
  const level = await id(admin.from("levels").insert({ school_id: A.id, name: "P9ra-Niveau", cycle: "college" }), "level");
  const c1 = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name: "P9ra-1A" }), "c1");
  const c2 = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name: "P9ra-1B" }), "c2");
  const subject = await id(admin.from("subjects").insert({ school_id: A.id, name: "P9ra-Maths" }), "subject");
  const dirClient = await signIn(fx.users.dirA);
  must(await dirClient.from("teacher_subjects").insert({ school_id: A.id, teacher_id: tch, subject_id: subject }), "teaches");
  const lesson = await id(admin.from("lessons").insert({
    school_id: A.id, academic_year_id: year, time_slot_id: slot, class_id: c1, subject_id: subject, teacher_id: tch,
  }), "lesson");

  const students = [];
  const guardians = [];
  const parentIn = async (name, klass) => {
    const kid = await id(admin.from("students").insert({ school_id: A.id, first_name: "Kid", last_name: name, birth_date: "2014-01-01", gender: "male" }), name);
    students.push(kid);
    must(await admin.from("student_enrollments").insert({ school_id: A.id, student_id: kid, academic_year_id: year, class_id: klass }), "enrol");
    const email = `rls-test+${fx.run}-${name}@example.com`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), name).user;
    fx.createdUserIds.push(user.id);
    must(await admin.from("profiles").insert({
      id: user.id, school_id: A.id, role_id: A.roles.parent, full_name: `RLS ${name}`, must_change_password: false,
    }), name);
    const g = await id(admin.from("guardians").insert({ school_id: A.id, last_name: name, first_name: "Parent", phone: randomMobile(), profile_id: user.id }), "guardian");
    guardians.push(g);
    must(await admin.from("student_guardians").insert({ school_id: A.id, student_id: kid, guardian_id: g, relation: "father" }), "link");
    return { id: user.id, student: kid, cookies: await sessionCookies({ email, password }) };
  };
  const p1 = await parentIn("p9rapar1", c1);
  const p2 = await parentIn("p9rapar2", c2);

  const dir = await sessionCookies(fx.users.dirA);
  const surv = await sessionCookies(fx.users.survA);
  const tchCookies = await sessionCookies(fx.users.tchA);
  const dirB = await sessionCookies(fx.users.dirB);

  const call = (cookies, action, path, ...args) => callAction(baseUrl, { id: actionId(FILE, action), path, args, cookies });
  const REMARKS = `/fr/remarks?class=${c1}`;
  const create = (cookies, student, input, path = REMARKS) => call(cookies, "createRemark", path, student, input);
  const row = async (remark) => (await admin.from("student_remarks").select("*").eq("id", remark).maybeSingle()).data;
  const get = async (path, cookies) => {
    const res = await fetch(new URL(path, baseUrl), { headers: { cookie: cookies }, redirect: "manual" });
    return { status: res.status, html: res.status === 200 ? await res.text() : "" };
  };
  const rendered = (html, attr) => (html.match(new RegExp(attr, "g")) ?? []).length;

  try {
    // --- Write ----------------------------------------------------------------------------------------------
    const byTeacher = await create(tchCookies, p1.student, { type: "homework", body: "  Devoir non rendu.  " });
    const r1 = byTeacher.ok ? await row(byTeacher.data.id) : null;
    check(label("a teacher writes on a student of their class (text trimmed)"), byTeacher.ok === true && r1?.body === "Devoir non rendu." && r1.created_by === fx.users.tchA.id, JSON.stringify(byTeacher));
    const { data: notes } = await admin.from("notifications").select("recipient_id").eq("type", "remark").filter("data->>remark_id", "eq", byTeacher.data?.id ?? "");
    check(label("…the parent is told"), notes?.length === 1 && notes[0].recipient_id === p1.id, JSON.stringify(notes));
    const { data: log } = await admin.from("audit_logs").select("data").eq("action", "remark.create").eq("entity_id", byTeacher.data?.id ?? "");
    check(label("…and it is in the audit log"), log?.length === 1 && log[0].data?.type === "homework", JSON.stringify(log));
    const fromLesson = await create(tchCookies, p1.student, { type: "praise", body: "Bonne participation." }, `/fr/my-timetable/${lesson}`);
    check(label("a teacher writes from the lesson page too"), fromLesson.ok === true, JSON.stringify(fromLesson));
    const other = await create(tchCookies, p2.student, { type: "behavior", body: "x" });
    check(label("a teacher cannot write on a student of a class they do not teach"), other.ok === false && other.error === "forbidden", JSON.stringify(other));
    const bySurv = await create(surv, p2.student, { type: "material", body: "Oubli de la blouse." }, `/fr/students/${p2.student}`);
    check(label("the surveillant writes on any student from the student page"), bySurv.ok === true, JSON.stringify(bySurv));
    const refused = async (name, input, error, field) => {
      const r = await create(tchCookies, p1.student, input);
      check(label(`refused: ${name}`), r.ok === false && r.error === error && r.field === field, JSON.stringify(r));
    };
    await refused("no type", { body: "x" }, "typeRequired", "type");
    await refused("an unknown type", { type: "insolence", body: "x" }, "typeRequired", "type");
    await refused("no text", { type: "praise", body: "   " }, "bodyRequired", "body");
    await refused("a 501-character text", { type: "praise", body: "x".repeat(501) }, "bodyTooLong", "body");
    const badStudent = await create(tchCookies, "not-a-uuid", { type: "praise", body: "x" });
    check(label("refused: a bad student id"), badStudent.ok === false && badStudent.error === "notFound", JSON.stringify(badStudent));
    const byParent = await create(p1.cookies, p1.student, { type: "praise", body: "x" });
    check(label("a parent cannot write"), byParent.ok === false && byParent.error === "forbidden", JSON.stringify(byParent));
    const byB = await create(dirB, p1.student, { type: "praise", body: "x" }, "/fr/remarks");
    check(label("the director of school B cannot write on A's student"), byB.ok === false, JSON.stringify(byB));

    // --- Edit (author, 24 h) -----------------------------------------------------------------------------------
    const remark = byTeacher.data.id;
    const edit = (cookies, input) => call(cookies, "updateRemark", REMARKS, remark, input);
    const edited = await edit(tchCookies, { type: "behavior", body: "Bavardages." });
    check(label("the author edits within 24 h"), edited.ok === true && (await row(remark)).type === "behavior", JSON.stringify(edited));
    const notAuthor = await edit(dir, { type: "praise", body: "x" });
    check(label("the director cannot edit a teacher's remark"), notAuthor.ok === false && (await row(remark)).type === "behavior", JSON.stringify(notAuthor));

    // --- Pages --------------------------------------------------------------------------------------------------
    const tchPage = await get(REMARKS, tchCookies);
    check(label("the teacher's /remarks shows the class list with a button per student"),
      tchPage.status === 200 && rendered(tchPage.html, 'data-student="') === 1 && tchPage.html.includes("Bavardages."), String(tchPage.status));
    const tchOther = await get(`/fr/remarks?class=${c2}`, tchCookies);
    check(label("…a class they do not teach falls back to their own"), tchOther.status === 200 && !tchOther.html.includes("Oubli de la blouse."), String(tchOther.status));
    const dirPage = await get(`/fr/remarks?class=${c2}`, dir);
    check(label("the director sees any class and its remarks"), dirPage.status === 200 && dirPage.html.includes("Oubli de la blouse."), String(dirPage.status));
    const studentPage = await get(`/fr/students/${p1.student}`, dir);
    check(label("the student page shows the remarks card"), studentPage.status === 200 && studentPage.html.includes("Bavardages.") && studentPage.html.includes("Bonne participation."), String(studentPage.status));
    const parentPage = await get(`/fr/portal/remarks?child=${p1.student}`, p1.cookies);
    check(label("the parent sees their child's remarks, unread"),
      parentPage.status === 200 && parentPage.html.includes("Bavardages.") && rendered(parentPage.html, 'data-remark-read="false"') === 2 && !parentPage.html.includes("Oubli de la blouse."),
      String(parentPage.status));
    const parent2Page = await get(`/fr/portal/remarks?child=${p1.student}`, p2.cookies);
    check(label("another parent asking for that child sees only their own"), parent2Page.status === 200 && !parent2Page.html.includes("Bavardages.") && parent2Page.html.includes("Oubli de la blouse."), String(parent2Page.status));
    const parentStaff = await get(REMARKS, p1.cookies);
    check(label("a parent opening /remarks gets no class list"), parentStaff.status !== 200 || rendered(parentStaff.html, 'data-student="') === 0, String(parentStaff.status));
    const accountant = await get(REMARKS, await sessionCookies(fx.users.audA));
    check(label("staff without attendance.manage get no class list"), accountant.status !== 200 || rendered(accountant.html, 'data-student="') === 0, String(accountant.status));

    // --- "Lu" ---------------------------------------------------------------------------------------------------
    const PORTAL = `/fr/portal/remarks?child=${p1.student}`;
    const read = await call(p1.cookies, "markRemarkRead", PORTAL, remark);
    const readRow = await row(remark);
    check(label("the parent marks it read"), read.ok === true && readRow.read_by === p1.id && Boolean(readRow.read_at), JSON.stringify(read));
    const { data: readNotes } = await admin.from("notifications").select("read_at").eq("type", "remark").filter("data->>remark_id", "eq", remark);
    check(label("…its notification is read too"), readNotes?.every((n) => n.read_at), JSON.stringify(readNotes));
    const otherRead = await call(p2.cookies, "markRemarkRead", PORTAL, fromLesson.data.id);
    check(label("another child's parent cannot mark it read"), otherRead.ok === false && !(await row(fromLesson.data.id)).read_at, JSON.stringify(otherRead));
    const staffRead = await call(tchCookies, "markRemarkRead", PORTAL, fromLesson.data.id);
    check(label("staff cannot mark it read"), staffRead.ok === false, JSON.stringify(staffRead));

    // --- Delete: author 24 h, moderation by the director -------------------------------------------------------------
    await admin.from("student_remarks").update({ created_at: new Date(Date.now() - 25 * 3_600_000).toISOString() }).eq("id", remark);
    const late = await edit(tchCookies, { type: "praise", body: "Trop tard." });
    check(label("the author cannot edit after 24 h"), late.ok === false && late.error === "locked", JSON.stringify(late));
    const lateDel = await call(tchCookies, "deleteRemark", REMARKS, remark);
    check(label("the author cannot delete after 24 h"), lateDel.ok === false && lateDel.error === "locked" && (await row(remark)) !== null, JSON.stringify(lateDel));
    const parentDel = await call(p1.cookies, "deleteRemark", PORTAL, remark);
    check(label("a parent cannot delete"), parentDel.ok === false && (await row(remark)) !== null, JSON.stringify(parentDel));
    const mod = await call(dir, "deleteRemark", REMARKS, remark);
    const { data: modLog } = await admin.from("audit_logs").select("action, actor_id").eq("entity", "student_remark").eq("entity_id", remark).in("action", ["remark.moderate", "remark.delete"]);
    check(label("the director deletes it (moderation), logged by the database"),
      mod.ok === true && (await row(remark)) === null && modLog?.length === 1 && modLog[0].action === "remark.moderate" && modLog[0].actor_id === fx.users.dirA.id,
      JSON.stringify({ mod, modLog }));
    const own = await call(tchCookies, "deleteRemark", REMARKS, fromLesson.data.id);
    check(label("the author deletes their own within 24 h"), own.ok === true && (await row(fromLesson.data.id)) === null, JSON.stringify(own));
    const again = await call(dir, "deleteRemark", REMARKS, fromLesson.data.id);
    check(label("deleting it again says not found"), again.ok === false && again.error === "notFound", JSON.stringify(again));
  } finally {
    await admin.from("student_guardians").delete().in("student_id", students);
    await admin.from("guardians").delete().in("id", guardians);
    await admin.from("students").delete().in("id", students);
    await admin.from("notifications").delete().eq("school_id", A.id).eq("type", "remark");
    await admin.from("lessons").delete().eq("id", lesson);
    await admin.from("teacher_subjects").delete().eq("subject_id", subject);
    await admin.from("classes").delete().in("id", [c1, c2]);
    await admin.from("time_slots").delete().eq("id", slot);
    if (!monday) await admin.from("school_days").delete().eq("academic_year_id", year).eq("day_of_week", 1);
    await admin.from("levels").delete().eq("id", level);
    await admin.from("subjects").delete().eq("id", subject);
    if (before && before.id !== year) await admin.from("academic_years").update({ is_current: true }).eq("id", before.id);
    else if (!before) await admin.from("academic_years").update({ is_current: false }).eq("id", year);
    if (ownYear) await admin.from("academic_years").delete().eq("id", year);
    await admin.from("profiles").update({ must_change_password: tchState.must_change_password, deactivated_at: tchState.deactivated_at }).eq("id", tch);
  }
}
