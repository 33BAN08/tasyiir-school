// Phase 7 step 6: the school's side of justifications — the review list
// (/absences?view=justifications, attendance.view) with approve / reject /
// reopen / remove, and "justify one absence" from the class day view
// (attendance.manage). Server Actions called over HTTP as real users on the
// page that renders them.
import { randomBytes, randomUUID } from "node:crypto";

import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";
import { randomMobile } from "./phase5-guardians.mjs";

const FILE = "src/lib/justifications/staff-actions.ts";
const URL_FILE = "src/lib/justifications/actions.ts";
const BUCKET = "justifications";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const DAY = 86_400_000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const isoDow = (t) => ((new Date(t).getUTCDay() + 6) % 7) + 1;

export async function staffJustificationActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const id = async (query) => (await query.select("id").single()).data.id;
  const now = Date.now(); // Morocco is UTC+0: the UTC date is the school's date
  let pastTime = now - DAY;
  while (isoDow(pastTime) === 7) pastTime -= DAY;
  const past = iso(pastTime);
  const today = iso(now);
  const dow = isoDow(pastTime);

  const email = `rls-test+${fx.run}-sjpar@example.com`;
  const password = `${randomBytes(12).toString("base64url")}a1`;
  const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  fx.createdUserIds.push(created.user.id);
  await admin.from("profiles").insert({ id: created.user.id, school_id: A.id, role_id: A.roles.parent, full_name: "RLS sjpar", must_change_password: false });
  const par = { id: created.user.id, email, password };
  const parClient = await signIn(par);
  const cookies = {
    surv: await sessionCookies(fx.users.survA),
    aud: await sessionCookies(fx.users.audA),
    dirB: await sessionCookies(fx.users.dirB),
    par: await sessionCookies(par),
  };

  const { data: existing } = await admin.from("academic_years").select("id").eq("school_id", A.id)
    .lte("start_date", past).gte("end_date", today).maybeSingle();
  const ownYear = !existing;
  const year = existing?.id ?? await id(admin.from("academic_years").insert({
    school_id: A.id, label: "SJ-annee", start_date: iso(now - 60 * DAY), end_date: iso(now + 200 * DAY), is_current: false,
  }));
  const { data: dayRow } = await admin.from("school_days").select("day_of_week").eq("academic_year_id", year).eq("day_of_week", dow).maybeSingle();
  if (!dayRow) await admin.from("school_days").insert({ school_id: A.id, academic_year_id: year, day_of_week: dow });
  const slot = await id(admin.from("time_slots").insert({
    school_id: A.id, academic_year_id: year, day_of_week: dow, start_time: "21:30", end_time: "22:00", kind: "lesson",
  }));
  const level = await id(admin.from("levels").insert({ school_id: A.id, name: "SJ-Niveau", cycle: "college" }));
  const klass = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name: "SJ-1" }));
  const subject = await id(admin.from("subjects").insert({ school_id: A.id, name: "SJ-Arabe" }));
  await (await signIn(fx.users.dirA)).from("teacher_subjects").insert({ school_id: A.id, teacher_id: fx.users.tchA.id, subject_id: subject });
  const lesson = await id(admin.from("lessons").insert({
    school_id: A.id, academic_year_id: year, time_slot_id: slot, class_id: klass, subject_id: subject, teacher_id: fx.users.tchA.id,
  }));
  const kid = async (name) => {
    const s = await id(admin.from("students").insert({ school_id: A.id, first_name: "Kid", last_name: name, birth_date: "2014-01-01", gender: "male" }));
    await admin.from("student_enrollments").insert({ school_id: A.id, student_id: s, academic_year_id: year, class_id: klass });
    return s;
  };
  const kid1 = await kid("SJKIDONE");
  const kid2 = await kid("SJKIDTWO");
  const g = await id(admin.from("guardians").insert({ school_id: A.id, last_name: "SJ", first_name: "Parent", phone: randomMobile(), profile_id: par.id }));
  await admin.from("student_guardians").insert({ school_id: A.id, student_id: kid1, guardian_id: g, relation: "father" });
  const survA = await signIn(fx.users.survA);
  const saved = await survA.rpc("save_attendance", { p_lesson: lesson, p_date: past, p_marks: [{ student_id: kid1, status: "absent" }] });
  if (saved.error) throw new Error(`staffJustificationActions setup: attendance (${saved.error.code})`);
  const session = saved.data;

  const REVIEW = "/fr/absences?view=justifications&status=pending";
  const DAYPAGE = `/fr/absences?view=day&date=${past}&class=${klass}`;
  const call = (who, path, file, action, ...args) => callAction(baseUrl, { id: actionId(file, action), path, args, cookies: cookies[who] });
  const expect = async (label, promise, wanted) => {
    const r = await promise;
    const got = r.ok ? "ok" : r.error;
    check(`[P7 staff justif] ${label}`, got === wanted, got);
    return r;
  };
  const exists = async (path) => {
    const folder = path.slice(0, path.lastIndexOf("/"));
    const { data } = await admin.storage.from(BUCKET).list(folder);
    return (data ?? []).some((o) => `${folder}/${o.name}` === path);
  };
  const pageOf = async (who, path) => {
    const res = await fetch(new URL(path, baseUrl), { headers: { Cookie: cookies[who] }, redirect: "manual" });
    return { status: res.status, html: await res.text() };
  };
  const row = async (rowId) => (await admin.from("justifications").select("status, review_note, reviewed_by, kind, from_date, file_path").eq("id", rowId).maybeSingle()).data;

  // A parent's pending justification, with a note.
  const noteFile = `${A.id}/${kid1}/${randomUUID()}.png`;
  await parClient.storage.from(BUCKET).upload(noteFile, PNG, { contentType: "image/png" });
  const sent = await parClient.from("justifications")
    .insert({ school_id: A.id, student_id: kid1, kind: "days", from_date: past, to_date: past, reason: "Malade", file_path: noteFile, submitted_by: par.id })
    .select("id").single();
  const j1 = sent.data?.id;

  // --- Review list ------------------------------------------------------------------------------
  let page = await pageOf("surv", REVIEW);
  check("[P7 staff justif] the review list shows the pending justification (with its student)",
    page.status === 200 && page.html.includes('data-testid="review-list"') && page.html.includes("SJKIDONE"), `status ${page.status}`);
  page = await pageOf("aud", REVIEW);
  check("[P7 staff justif] staff without attendance.view are sent away",
    page.status >= 300 || (!page.html.includes('data-testid="review-list"') && /NEXT_REDIRECT|NEXT_HTTP_ERROR_FALLBACK/.test(page.html)), `status ${page.status}`);
  page = await pageOf("dirB", REVIEW);
  check("[P7 staff justif] another school's director never sees school A's justifications", !page.html.includes("SJKIDONE"), `status ${page.status}`);

  // --- Review ------------------------------------------------------------------------------------
  await expect("a parent cannot review", call("par", REVIEW, FILE, "reviewJustification", j1, "approved", ""), "forbidden");
  await expect("staff without attendance.manage cannot review", call("aud", REVIEW, FILE, "reviewJustification", j1, "approved", ""), "forbidden");
  await expect("another school's director: not found", call("dirB", REVIEW, FILE, "reviewJustification", j1, "approved", ""), "notFound");
  await expect("a malformed id → notFound", call("surv", REVIEW, FILE, "reviewJustification", "nope", "approved", ""), "notFound");
  await expect("an unknown state → notFound", call("surv", REVIEW, FILE, "reviewJustification", j1, "maybe", ""), "notFound");
  await expect("a reply over 300 characters → noteTooLong", call("surv", REVIEW, FILE, "reviewJustification", j1, "rejected", "x".repeat(301)), "noteTooLong");
  await expect("the surveillant rejects it with a reply", call("surv", REVIEW, FILE, "reviewJustification", j1, "rejected", "  Illisible  "), "ok");
  let r = await row(j1);
  check("[P7 staff justif] …rejected, reply trimmed, reviewed by them",
    r?.status === "rejected" && r?.review_note === "Illisible" && r?.reviewed_by === fx.users.survA.id, JSON.stringify(r));
  await expect("approved without reply", call("surv", REVIEW, FILE, "reviewJustification", j1, "approved", ""), "ok");
  r = await row(j1);
  check("[P7 staff justif] …approved, reply empty", r?.status === "approved" && r?.review_note === null, JSON.stringify(r));
  const { data: audit } = await admin.from("audit_logs").select("action").eq("entity_id", j1).eq("action", "justification.review");
  check("[P7 staff justif] …every review is audited", (audit ?? []).length === 2, String(audit?.length));
  page = await pageOf("surv", DAYPAGE);
  check("[P7 staff justif] the class day shows the absence as justified", page.html.includes('data-state="justified"'));
  await expect("back to pending (reply cleared)", call("surv", REVIEW, FILE, "reviewJustification", j1, "pending", "ignored"), "ok");
  r = await row(j1);
  check("[P7 staff justif] …pending, no reviewer, no reply", r?.status === "pending" && r?.review_note === null && r?.reviewed_by === null, JSON.stringify(r));
  page = await pageOf("surv", DAYPAGE);
  check("[P7 staff justif] …and the day shows it as pending", page.html.includes('data-state="pending"') && !page.html.includes('data-state="justified"'));

  // --- Justify one absence ------------------------------------------------------------------------
  const url = await expect("staff open the parent's note", call("surv", REVIEW, URL_FILE, "getJustificationFileUrl", j1), "ok");
  check("[P7 staff justif] …the link works", url.ok && (await fetch(url.data.url)).status === 200);

  await expect("a parent cannot justify an absence", call("par", DAYPAGE, FILE, "justifyAbsence", session, kid1, "Mot", null), "forbidden");
  await expect("staff without attendance.manage cannot", call("aud", DAYPAGE, FILE, "justifyAbsence", session, kid1, "Mot", null), "forbidden");
  await expect("an empty reason → reasonRequired", call("surv", DAYPAGE, FILE, "justifyAbsence", session, kid1, "  ", null), "reasonRequired");
  await expect("a reason over 500 characters → tooLong", call("surv", DAYPAGE, FILE, "justifyAbsence", session, kid1, "x".repeat(501), null), "tooLong");
  await expect("a student with no mark that day → markNotFound", call("surv", DAYPAGE, FILE, "justifyAbsence", session, kid2, "Mot", null), "markNotFound");
  await expect("a malformed session → notFound", call("surv", DAYPAGE, FILE, "justifyAbsence", "nope", kid1, "Mot", null), "notFound");
  {
    const other = await call("dirB", DAYPAGE, FILE, "justifyAbsence", session, kid1, "Mot", null);
    check("[P7 staff justif] another school's director cannot justify school A's absence", !other.ok && ["notFound", "markNotFound", "forbidden"].includes(other.error), other.ok ? "ok" : other.error);
  }

  const markFile = `${A.id}/${kid1}/${randomUUID()}.png`;
  await survA.storage.from(BUCKET).upload(markFile, PNG, { contentType: "image/png" });
  await expect("a note path of another student → fileUpload", call("surv", DAYPAGE, FILE, "justifyAbsence", session, kid1, "Mot", `${A.id}/${kid2}/${randomUUID()}.png`), "fileUpload");
  await expect("the surveillant justifies the absence from a paper note, with its photo", call("surv", DAYPAGE, FILE, "justifyAbsence", session, kid1, "Mot du père", markFile), "ok");
  const { data: mark } = await admin.from("justifications").select("id, status, kind, from_date, to_date, submitted_by, reviewed_by, file_path").eq("kind", "mark").eq("student_id", kid1).single();
  check("[P7 staff justif] …approved at once, on the mark's day, by them, with the file",
    mark?.status === "approved" && mark?.from_date === past && mark?.to_date === past && mark?.submitted_by === fx.users.survA.id && mark?.file_path === markFile,
    JSON.stringify(mark));
  page = await pageOf("surv", DAYPAGE);
  check("[P7 staff justif] the day now shows it as justified", page.html.includes('data-state="justified"'));

  const failedFile = `${A.id}/${kid1}/${randomUUID()}.png`;
  await survA.storage.from(BUCKET).upload(failedFile, PNG, { contentType: "image/png" });
  await expect("a failed justification (empty reason) removes the uploaded note", call("surv", DAYPAGE, FILE, "justifyAbsence", session, kid1, "", failedFile), "reasonRequired");
  check("[P7 staff justif] …the file is gone", !(await exists(failedFile)));

  // --- Remove ---------------------------------------------------------------------------------------
  await expect("a parent cannot remove a justification (staff action)", call("par", REVIEW, FILE, "removeJustification", mark?.id), "forbidden");
  await expect("another school's director cannot", call("dirB", REVIEW, FILE, "removeJustification", mark?.id), "notFound");
  check("[P7 staff justif] …it is still there", Boolean(await row(mark?.id)));
  await expect("the surveillant removes the paper-note justification", call("surv", REVIEW, FILE, "removeJustification", mark?.id), "ok");
  check("[P7 staff justif] …the row and its file are gone", !(await row(mark?.id)) && !(await exists(markFile)));
  await expect("removing it again → notFound", call("surv", REVIEW, FILE, "removeJustification", mark?.id), "notFound");

  // --- Clean up ------------------------------------------------------------------------------------
  const { data: left } = await admin.storage.from(BUCKET).list(`${A.id}/${kid1}`);
  if (left?.length) await admin.storage.from(BUCKET).remove(left.map((o) => `${A.id}/${kid1}/${o.name}`));
  await admin.from("justifications").delete().in("student_id", [kid1, kid2]);
  await admin.from("attendance_sessions").delete().eq("class_id", klass);
  await admin.from("student_guardians").delete().in("student_id", [kid1, kid2]);
  await admin.from("guardians").delete().eq("profile_id", par.id);
  await admin.from("student_enrollments").delete().in("student_id", [kid1, kid2]);
  await admin.from("students").delete().in("id", [kid1, kid2]);
  await admin.from("lessons").delete().eq("id", lesson);
  await admin.from("teacher_subjects").delete().eq("subject_id", subject);
  await admin.from("classes").delete().eq("id", klass);
  await admin.from("time_slots").delete().eq("id", slot);
  if (!dayRow) await admin.from("school_days").delete().eq("academic_year_id", year).eq("day_of_week", dow);
  if (ownYear) await admin.from("academic_years").delete().eq("id", year);
  await admin.from("levels").delete().eq("id", level);
  await admin.from("subjects").delete().eq("id", subject);
}
