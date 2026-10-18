// Phase 7 step 4: justifications (database + private Storage bucket). A parent
// sends 'days' for their own child, always pending; staff (attendance.manage)
// enter 'days' or 'mark' (one absence), approved at once, and review. What
// was sent and by whom never changes. Files: <school>/<student>/<uuid>.<ext>,
// read only by who can read the justification (or the uploader), names checked.
import { randomBytes, randomUUID } from "node:crypto";

import { allowed, check, denied, rows } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";
import { randomMobile } from "./phase5-guardians.mjs";

const BUCKET = "justifications";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const DAY = 86_400_000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const isoDow = (t) => ((new Date(t).getUTCDay() + 6) % 7) + 1;

export async function phase7Justifications({ fx, as }) {
  const A = fx.schools.a;

  const { survA, audA, tchA, dirB, owner } = as;
  const must = (r, what) => {
    if (r.error) throw new Error(`phase7Justifications setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (query, what) => must(await query.select("id").single(), what).id;
  const refused = async (label, query, wanted) => {
    const { error } = await query;
    const got = error ? (error.code === "P0001" ? error.message : error.code) : "ACCEPTED!";
    check(`[P7 justif] ${label}`, got === wanted, error ? `${error.code} ${error.message}` : got);
  };
  const now = Date.now(); // Morocco is UTC+0: the UTC date is the school's date
  let pastTime = now - DAY;
  while (isoDow(pastTime) === 7) pastTime -= DAY;
  const past = iso(pastTime);
  const today = iso(now);

  // --- Parents (own password set) of two students -------------------------------------------
  const parent = async (name) => {
    const email = `rls-test+${fx.run}-${name}@example.com`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), name).user;
    fx.createdUserIds.push(user.id);
    must(await admin.from("profiles").insert({ id: user.id, school_id: A.id, role_id: A.roles.parent, full_name: `RLS ${name}`, must_change_password: false }), name);
    return { id: user.id, client: await signIn({ email, password }) };
  };
  const par1 = await parent("jupar1");
  const par2 = await parent("jupar2");

  // --- A class with a lesson on the past day; kid1 is absent then ----------------------------
  const { data: existing } = await admin.from("academic_years").select("id").eq("school_id", A.id)
    .lte("start_date", past).gte("end_date", today).maybeSingle();
  const ownYear = !existing;
  const year = existing?.id ?? await id(admin.from("academic_years").insert({
    school_id: A.id, label: "JU-annee", start_date: iso(now - 60 * DAY), end_date: iso(now + 200 * DAY), is_current: false,
  }), "year");
  const dow = isoDow(pastTime);
  const { data: dayRow } = await admin.from("school_days").select("day_of_week").eq("academic_year_id", year).eq("day_of_week", dow).maybeSingle();
  if (!dayRow) must(await admin.from("school_days").insert({ school_id: A.id, academic_year_id: year, day_of_week: dow }), "day");
  const slot = await id(admin.from("time_slots").insert({
    school_id: A.id, academic_year_id: year, day_of_week: dow, start_time: "22:30", end_time: "23:00", kind: "lesson",
  }), "slot");
  const level = await id(admin.from("levels").insert({ school_id: A.id, name: "JU-Niveau", cycle: "college" }), "level");
  const klass = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name: "JU-1" }), "class");
  const subject = await id(admin.from("subjects").insert({ school_id: A.id, name: "JU-Arabe" }), "subject");
  must(await (await signIn(fx.users.dirA)).from("teacher_subjects").insert({ school_id: A.id, teacher_id: fx.users.tchA.id, subject_id: subject }), "teaches");
  const lesson = await id(admin.from("lessons").insert({
    school_id: A.id, academic_year_id: year, time_slot_id: slot, class_id: klass, subject_id: subject, teacher_id: fx.users.tchA.id,
  }), "lesson");
  const kid = async (name) => {
    const s = await id(admin.from("students").insert({ school_id: A.id, first_name: "Kid", last_name: name, birth_date: "2014-01-01", gender: "male" }), name);
    must(await admin.from("student_enrollments").insert({ school_id: A.id, student_id: s, academic_year_id: year, class_id: klass }), "enrol");
    return s;
  };
  const kid1 = await kid("JUK1");
  const kid2 = await kid("JUK2");
  for (const [par, k] of [[par1, kid1], [par2, kid2]]) {
    const g = await id(admin.from("guardians").insert({ school_id: A.id, last_name: "JU", first_name: "Parent", phone: randomMobile(), profile_id: par.id }), "guardian");
    must(await admin.from("student_guardians").insert({ school_id: A.id, student_id: k, guardian_id: g, relation: "father" }), "link");
  }
  const session = must(await survA.rpc("save_attendance", {
    p_lesson: lesson, p_date: past, p_marks: [{ student_id: kid1, status: "absent" }],
  }), "attendance");

  const days = (studentId, extra = {}) => ({ school_id: A.id, student_id: studentId, kind: "days", from_date: past, to_date: past, reason: "Malade", ...extra });
  const insert = (client, row) => client.from("justifications").insert(row).select("id, status, submitted_by, reviewed_by, from_date").single();

  // --- A parent sends 'days' for their own child: always pending ------------------------------
  const sent = await insert(par1.client, days(kid1, { status: "approved", reviewed_by: fx.users.survA.id }));
  check("[P7 justif] a parent sends a justification for their child: pending, sent by them, not reviewed",
    !sent.error && sent.data?.status === "pending" && sent.data?.submitted_by === par1.id && sent.data?.reviewed_by === null,
    sent.error?.message ?? JSON.stringify(sent.data));
  const j1 = sent.data?.id;
  await refused("a parent cannot send for another family's child", insert(par1.client, days(kid2)), "42501");
  await refused("a parent cannot send a 'mark' justification", insert(par1.client, { ...days(kid1), kind: "mark", session_id: session }), "42501");
  await refused("more than 30 days ahead", insert(par1.client, days(kid1, { from_date: iso(now + 40 * DAY), to_date: iso(now + 40 * DAY) })), "justification_dates_out_of_range");
  await refused("more than 31 days long", insert(par1.client, days(kid1, { from_date: iso(pastTime - 40 * DAY) })), "23514");
  await refused("an empty reason", insert(par1.client, days(kid1, { reason: "" })), "23514");
  await refused("a file of another child's folder", insert(par1.client, days(kid1, { file_path: `${A.id}/${kid2}/${randomUUID()}.png` })), "23514");
  await rows("[P7 justif] the parent reads their child's justification", par1.client.from("justifications").select("id").eq("id", j1), 1);
  await rows("[P7 justif] another parent does not", par2.client.from("justifications").select("id").eq("id", j1), 0);
  await denied("[P7 justif] a parent cannot approve", par1.client.from("justifications").update({ status: "approved" }).eq("id", j1).select("id"));

  // --- Staff review ---------------------------------------------------------------------------
  await allowed("[P7 justif] the surveillant approves it", survA.from("justifications").update({ status: "approved", review_note: "Certificat vu" }).eq("id", j1).select("id"));
  const { data: reviewed } = await admin.from("justifications").select("status, reviewed_by, reviewed_at").eq("id", j1).single();
  check("[P7 justif] …reviewed by them, now", reviewed?.status === "approved" && reviewed?.reviewed_by === fx.users.survA.id && !!reviewed?.reviewed_at);
  await refused("what was sent cannot change (dates)", survA.from("justifications").update({ from_date: iso(pastTime - DAY) }).eq("id", j1), "justification_locked");
  await refused("…nor the reason", survA.from("justifications").update({ reason: "Autre" }).eq("id", j1), "justification_locked");
  await allowed("[P7 justif] back to pending clears the review", survA.from("justifications").update({ status: "pending", review_note: null }).eq("id", j1).select("id"));
  const { data: reopened } = await admin.from("justifications").select("reviewed_by, reviewed_at").eq("id", j1).single();
  check("[P7 justif] …reviewer and time cleared", reopened?.reviewed_by === null && reopened?.reviewed_at === null);

  // Staff justify one absence (paper note): approved at once, dates from the mark.
  const staffMark = await insert(survA, { school_id: A.id, student_id: kid1, kind: "mark", session_id: session, from_date: "2000-01-01", to_date: "2000-01-01", reason: "Mot du père" });
  check("[P7 justif] staff justify one absence: approved by them, on the mark's day",
    !staffMark.error && staffMark.data?.status === "approved" && staffMark.data?.reviewed_by === fx.users.survA.id && staffMark.data?.from_date === past,
    staffMark.error?.message ?? JSON.stringify(staffMark.data));
  await refused("a 'mark' justification for a student who has no mark there", insert(survA, { school_id: A.id, student_id: kid2, kind: "mark", session_id: session, from_date: past, to_date: past, reason: "x" }), "23503");
  must(await survA.rpc("save_attendance", { p_lesson: lesson, p_date: past, p_marks: [] }), "present after all");
  await rows("[P7 justif] when the mark is removed (present after all), its 'mark' justification goes", admin.from("justifications").select("id").eq("id", staffMark.data?.id), 0);

  // --- Deleting -------------------------------------------------------------------------------
  const j2 = (await insert(par1.client, days(kid1, { reason: "Rendez-vous" }))).data?.id;
  await allowed("[P7 justif] a parent cancels their pending justification", par1.client.from("justifications").delete().eq("id", j2).select("id"));
  await survA.from("justifications").update({ status: "approved" }).eq("id", j1);
  await denied("[P7 justif] …but not once it was reviewed", par1.client.from("justifications").delete().eq("id", j1).select("id"));

  // --- Other people ----------------------------------------------------------------------------
  for (const [who, client] of [["staff without attendance permission", audA], ["a teacher", tchA], ["another school's director", dirB], ["the platform owner", owner]]) {
    await rows(`[P7 justif] ${who} reads nothing`, client.from("justifications").select("id").eq("school_id", A.id), 0);
  }
  await refused("staff without attendance permission cannot create one", insert(audA, days(kid1)), "42501");
  await refused("another school's director cannot create one for school A", insert(dirB, days(kid1)), "42501");
  must(await admin.from("school_modules").insert({ school_id: A.id, module_key: "attendance", enabled: false }), "module off");
  await rows("[P7 justif] module off: the surveillant reads nothing", survA.from("justifications").select("id"), 0);
  must(await admin.from("school_modules").delete().eq("school_id", A.id).eq("module_key", "attendance"), "module back");

  // --- Files ------------------------------------------------------------------------------------
  const upload = (client, path) => client.storage.from(BUCKET).upload(path, PNG, { contentType: "image/png" });
  const sign = (client, path) => client.storage.from(BUCKET).createSignedUrl(path, 60);
  const exists = async (path) => {
    const folder = path.slice(0, path.lastIndexOf("/"));
    const { data } = await admin.storage.from(BUCKET).list(folder);
    return (data ?? []).some((o) => `${folder}/${o.name}` === path);
  };
  const ok = (label, r) => check(`[P7 justif] ${label}`, !r.error, r.error ? `${r.error.statusCode} ${r.error.message}` : "ok");
  const no = (label, r) => check(`[P7 justif] ${label}`, Boolean(r.error), r.error ? `refused (${r.error.statusCode})` : "ACCEPTED!");

  const file1 = `${A.id}/${kid1}/${randomUUID()}.png`;
  ok("a parent uploads a note for their child", await upload(par1.client, file1));
  no("a parent upload with another file name is refused", await upload(par1.client, `${A.id}/${kid1}/certificat.png`));
  no("…with an extra folder too", await upload(par1.client, `${A.id}/${kid1}/x/${randomUUID()}.png`));
  no("…with another extension too", await upload(par1.client, `${A.id}/${kid1}/${randomUUID()}.gif`));
  no("a parent cannot upload for another family's child", await upload(par1.client, `${A.id}/${kid2}/${randomUUID()}.png`));
  no("another school's director cannot upload into school A", await upload(dirB, `${A.id}/${kid1}/${randomUUID()}.png`));
  ok("the uploader can read their own file (before any justification)", await sign(par1.client, file1));
  no("…nobody else can (orphan file)", await sign(survA, file1));
  const withFile = await insert(par1.client, days(kid1, { reason: "Certificat", file_path: file1 }));
  check("[P7 justif] the parent sends it with the file", !withFile.error, withFile.error?.message ?? "");
  ok("the surveillant can open the note (signed link)", await sign(survA, file1));
  no("another parent cannot", await sign(par2.client, file1));
  no("another school's director cannot", await sign(dirB, file1));
  await par1.client.storage.from(BUCKET).remove([file1]);
  check("[P7 justif] the parent can remove the file of a pending justification", !(await exists(file1)));

  const file2 = `${A.id}/${kid1}/${randomUUID()}.png`;
  await upload(par1.client, file2);
  const j3 = (await insert(par1.client, days(kid1, { reason: "Certificat 2", file_path: file2 }))).data?.id;
  await survA.from("justifications").update({ status: "rejected", review_note: "Illisible" }).eq("id", j3);
  await par1.client.storage.from(BUCKET).remove([file2]);
  check("[P7 justif] once reviewed, the parent cannot remove the note (kept as evidence)", await exists(file2));
  await survA.storage.from(BUCKET).remove([file2]);
  check("[P7 justif] staff can remove it", !(await exists(file2)));

  // --- Clean up ---------------------------------------------------------------------------------
  const { data: left } = await admin.storage.from(BUCKET).list(`${A.id}/${kid1}`);
  if (left?.length) await admin.storage.from(BUCKET).remove(left.map((o) => `${A.id}/${kid1}/${o.name}`));
  await admin.from("justifications").delete().in("student_id", [kid1, kid2]);
  await admin.from("attendance_sessions").delete().eq("class_id", klass);
  await admin.from("student_guardians").delete().in("student_id", [kid1, kid2]);
  await admin.from("guardians").delete().in("profile_id", [par1.id, par2.id]);
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
