// Phase 7 closing pass: attendance and justifications across schools for the
// two outside audiences. School B holds a roll call (absent + late marks), two
// justifications (one with a note file) and a student photo; a teacher and a
// parent of school A — each with real data of their own in A — read none of
// it, open no file, and change nothing.
import { randomBytes, randomUUID } from "node:crypto";

import { check, denied, rows } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";
import { randomMobile } from "./phase5-guardians.mjs";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const DAY = 86_400_000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const isoDow = (t) => ((new Date(t).getUTCDay() + 6) % 7) + 1;

export async function phase7CrossSchool({ fx, as }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const { tchA, dirB } = as;
  const must = (r, what) => {
    if (r.error) throw new Error(`phase7CrossSchool setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (query, what) => must(await query.select("id").single(), what).id;
  const now = Date.now(); // Morocco is UTC+0: the UTC date is the school's date
  let pastTime = now - DAY;
  while (isoDow(pastTime) === 7) pastTime -= DAY;
  const past = iso(pastTime);
  const today = iso(now);
  const dow = isoDow(pastTime);

  // --- A parent of school A (own password set) with a child and a justification there -------
  const email = `rls-test+${fx.run}-xjpara@example.com`;
  const password = `${randomBytes(12).toString("base64url")}a1`;
  const parUser = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), "parent A").user;
  fx.createdUserIds.push(parUser.id);
  must(await admin.from("profiles").insert({ id: parUser.id, school_id: A.id, role_id: A.roles.parent, full_name: "RLS xjpara", must_change_password: false }), "parent A profile");
  const parA = await signIn({ email, password });
  const kidA = await id(admin.from("students").insert({ school_id: A.id, first_name: "Kid", last_name: "XJA", birth_date: "2014-01-01", gender: "male" }), "kid A");
  const guardA = await id(admin.from("guardians").insert({ school_id: A.id, last_name: "XJA", first_name: "Parent", phone: randomMobile(), profile_id: parUser.id }), "guardian A");
  must(await admin.from("student_guardians").insert({ school_id: A.id, student_id: kidA, guardian_id: guardA, relation: "father" }), "link A");
  const ownJustif = await id(parA.from("justifications").insert({
    school_id: A.id, student_id: kidA, kind: "days", from_date: past, to_date: past, reason: "Malade",
  }), "justification A");

  // --- School B: a year containing the past day, a lesson that day, two absent / late kids ---
  const { data: existing } = await admin.from("academic_years").select("id").eq("school_id", B.id)
    .lte("start_date", past).gte("end_date", today).maybeSingle();
  const ownYear = !existing;
  const year = existing?.id ?? await id(admin.from("academic_years").insert({
    school_id: B.id, label: "XJ-annee", start_date: iso(now - 60 * DAY), end_date: iso(now + 200 * DAY), is_current: false,
  }), "year B");
  const { data: dayRow } = await admin.from("school_days").select("day_of_week").eq("academic_year_id", year).eq("day_of_week", dow).maybeSingle();
  if (!dayRow) must(await admin.from("school_days").insert({ school_id: B.id, academic_year_id: year, day_of_week: dow }), "day B");
  const slot = await id(admin.from("time_slots").insert({
    school_id: B.id, academic_year_id: year, day_of_week: dow, start_time: "22:00", end_time: "22:30", kind: "lesson",
  }), "slot B");
  const level = await id(admin.from("levels").insert({ school_id: B.id, name: "XJ-Niveau", cycle: "college" }), "level B");
  const klass = await id(admin.from("classes").insert({ school_id: B.id, academic_year_id: year, level_id: level, name: "XJ-1" }), "class B");
  const subject = await id(admin.from("subjects").insert({ school_id: B.id, name: "XJ-Arabe" }), "subject B");
  // The lesson's teacher must hold the teacher role: a teacher account of school B.
  const tEmail = `rls-test+${fx.run}-xjtchb@example.com`;
  const tUser = must(await admin.auth.admin.createUser({ email: tEmail, password, email_confirm: true }), "teacher B").user;
  fx.createdUserIds.push(tUser.id);
  must(await admin.from("profiles").insert({ id: tUser.id, school_id: B.id, role_id: B.roles.teacher, full_name: "RLS xjtchb", email: tEmail, must_change_password: false }), "teacher B profile");
  must(await dirB.from("teacher_subjects").insert({ school_id: B.id, teacher_id: tUser.id, subject_id: subject }), "teacher B teaches");
  const lesson = await id(admin.from("lessons").insert({
    school_id: B.id, academic_year_id: year, time_slot_id: slot, class_id: klass, subject_id: subject, teacher_id: tUser.id,
  }), "lesson B");
  const kidB = async (name) => {
    const s = await id(admin.from("students").insert({ school_id: B.id, first_name: "Kid", last_name: name, birth_date: "2014-01-01", gender: "female" }), name);
    must(await admin.from("student_enrollments").insert({ school_id: B.id, student_id: s, academic_year_id: year, class_id: klass }), "enrol B");
    return s;
  };
  const kid1 = await kidB("XJB1");
  const kid2 = await kidB("XJB2");
  const session = must(await dirB.rpc("save_attendance", {
    p_lesson: lesson, p_date: past, p_marks: [{ student_id: kid1, status: "absent" }, { student_id: kid2, status: "late", minutes_late: 5 }],
  }), "roll call B");

  // A note file + justification for kid1 (days), a 'mark' one for kid2, a photo of kid1.
  const file = `${B.id}/${kid1}/${randomUUID()}.png`;
  must(await dirB.storage.from("justifications").upload(file, PNG, { contentType: "image/png" }), "note B");
  const jDays = await id(dirB.from("justifications").insert({
    school_id: B.id, student_id: kid1, kind: "days", from_date: past, to_date: past, reason: "Certificat", file_path: file,
  }), "justification B days");
  const jMark = await id(dirB.from("justifications").insert({
    school_id: B.id, student_id: kid2, kind: "mark", session_id: session, from_date: past, to_date: past, reason: "Mot du père",
  }), "justification B mark");
  const photo = `${B.id}/${kid1}/${randomUUID()}.webp`;
  must(await admin.storage.from("student-photos").upload(photo, PNG, { contentType: "image/webp" }), "photo B");
  must(await admin.from("students").update({ photo_path: photo }).eq("id", kid1), "photo path B");

  // --- Controls: the data is really there, and the outsiders see their own --------------------
  await rows("[P7 cross-school] school B's director reads B's marks", dirB.from("attendance_marks").select("student_id").eq("session_id", session), 2);
  await rows("[P7 cross-school] school B's director reads B's justifications", dirB.from("justifications").select("id").in("id", [jDays, jMark]), 2);
  const own = await dirB.storage.from("justifications").createSignedUrl(file, 60);
  check("[P7 cross-school] school B's director opens B's note", !own.error, own.error?.message ?? "");
  await rows("[P7 cross-school] school A's parent reads their own child's justification", parA.from("justifications").select("id"), (r) => r.length === 1 && r[0].id === ownJustif);

  // --- Reads ------------------------------------------------------------------------------------
  const exists = async (bucket, path) => {
    const folder = path.slice(0, path.lastIndexOf("/"));
    const { data } = await admin.storage.from(bucket).list(folder);
    return (data ?? []).some((o) => `${folder}/${o.name}` === path);
  };
  for (const [who, client] of [["teacher of school A", tchA], ["parent of school A", parA]]) {
    await rows(`[P7 cross-school] ${who} reads no session of school B`, client.from("attendance_sessions").select("id").eq("school_id", B.id), 0);
    await rows(`[P7 cross-school] ${who} cannot read B's session by id`, client.from("attendance_sessions").select("id").eq("id", session), 0);
    await rows(`[P7 cross-school] ${who} reads no mark of school B`, client.from("attendance_marks").select("student_id").eq("school_id", B.id), 0);
    await rows(`[P7 cross-school] ${who} cannot read B's marks by session`, client.from("attendance_marks").select("student_id").eq("session_id", session), 0);
    await rows(`[P7 cross-school] ${who} reads no justification of school B`, client.from("justifications").select("id").eq("school_id", B.id), 0);
    await rows(`[P7 cross-school] ${who} cannot read B's justifications by id`, client.from("justifications").select("id").in("id", [jDays, jMark]), 0);
    await rows(`[P7 cross-school] ${who} cannot read B's absent student`, client.from("students").select("id").in("id", [kid1, kid2]), 0);
    const listed = await client.storage.from("justifications").list(`${B.id}/${kid1}`);
    check(`[P7 cross-school] ${who} lists no note file of school B`, (listed.data ?? []).length === 0, listed.error?.message ?? `${listed.data?.length ?? 0} file(s)`);
    const signed = await client.storage.from("justifications").createSignedUrl(file, 60);
    check(`[P7 cross-school] ${who} gets no signed link to B's note`, Boolean(signed.error), signed.error ? "refused" : "SIGNED!");
    const got = await client.storage.from("justifications").download(file);
    check(`[P7 cross-school] ${who} cannot download B's note`, Boolean(got.error), got.error ? "refused" : "DOWNLOADED!");
    const pic = await client.storage.from("student-photos").createSignedUrl(photo, 60);
    check(`[P7 cross-school] ${who} gets no signed link to B's student photo`, Boolean(pic.error), pic.error ? "refused" : "SIGNED!");
  }

  // --- Writes: none ----------------------------------------------------------------------------
  for (const [who, client] of [["teacher of school A", tchA], ["parent of school A", parA]]) {
    const call = await client.rpc("save_attendance", { p_lesson: lesson, p_date: past, p_marks: [] });
    check(`[P7 cross-school] ${who} cannot take or clear B's roll call`, Boolean(call.error), call.error ? (call.error.code === "P0001" ? call.error.message : call.error.code) : "ACCEPTED!");
    await denied(`[P7 cross-school] ${who} cannot add a mark to B's session`, client.from("attendance_marks").insert({
      school_id: B.id, session_id: session, student_id: kid1, status: "late",
    }).select("student_id"));
    await denied(`[P7 cross-school] ${who} cannot change B's marks`, client.from("attendance_marks").update({ note: "x" }).eq("session_id", session).select("student_id"));
    await denied(`[P7 cross-school] ${who} cannot delete B's marks`, client.from("attendance_marks").delete().eq("session_id", session).select("student_id"));
    await denied(`[P7 cross-school] ${who} cannot delete B's session`, client.from("attendance_sessions").delete().eq("id", session).select("id"));
    await denied(`[P7 cross-school] ${who} cannot send a justification for B's student`, client.from("justifications").insert({
      school_id: B.id, student_id: kid1, kind: "days", from_date: past, to_date: past, reason: "x",
    }).select("id"));
    await denied(`[P7 cross-school] ${who} cannot review B's justification`, client.from("justifications").update({ status: "rejected" }).eq("id", jDays).select("id"));
    await denied(`[P7 cross-school] ${who} cannot delete B's justification`, client.from("justifications").delete().in("id", [jDays, jMark]).select("id"));
    const up = await client.storage.from("justifications").upload(`${B.id}/${kid1}/${randomUUID()}.png`, PNG, { contentType: "image/png" });
    check(`[P7 cross-school] ${who} cannot upload into B's folder`, Boolean(up.error), up.error ? "refused" : "UPLOADED!");
    await client.storage.from("justifications").remove([file]);
    await client.storage.from("student-photos").remove([photo]);
  }
  const { data: marksLeft } = await admin.from("attendance_marks").select("student_id, status, note").eq("session_id", session);
  check("[P7 cross-school] B's marks are untouched", marksLeft?.length === 2 && marksLeft.every((m) => m.note === null));
  const { data: justifLeft } = await admin.from("justifications").select("status").in("id", [jDays, jMark]);
  check("[P7 cross-school] B's justifications are untouched", justifLeft?.length === 2 && justifLeft.every((j) => j.status === "approved"));
  const { count: strays } = await admin.from("justifications").select("id", { count: "exact", head: true }).eq("school_id", B.id).in("student_id", [kid1, kid2]);
  check("[P7 cross-school] no justification was added in B", strays === 2);
  const { data: bFiles } = await admin.storage.from("justifications").list(`${B.id}/${kid1}`);
  check("[P7 cross-school] B's note is still there, nothing added", (bFiles ?? []).length === 1 && await exists("justifications", file));
  check("[P7 cross-school] B's student photo is still there", await exists("student-photos", photo));

  // --- Clean up ---------------------------------------------------------------------------------
  const { data: notes } = await admin.storage.from("justifications").list(`${B.id}/${kid1}`);
  if (notes?.length) await admin.storage.from("justifications").remove(notes.map((o) => `${B.id}/${kid1}/${o.name}`));
  await admin.from("students").update({ photo_path: null }).eq("id", kid1);
  await admin.storage.from("student-photos").remove([photo]);
  await admin.from("justifications").delete().in("student_id", [kid1, kid2, kidA]);
  await admin.from("attendance_sessions").delete().eq("class_id", klass);
  await admin.from("student_guardians").delete().eq("guardian_id", guardA);
  await admin.from("guardians").delete().eq("id", guardA);
  await admin.from("student_enrollments").delete().in("student_id", [kid1, kid2]);
  await admin.from("students").delete().in("id", [kid1, kid2, kidA]);
  await admin.from("lessons").delete().eq("id", lesson);
  await admin.from("teacher_subjects").delete().eq("subject_id", subject);
  await admin.from("classes").delete().eq("id", klass);
  await admin.from("time_slots").delete().eq("id", slot);
  if (!dayRow) await admin.from("school_days").delete().eq("academic_year_id", year).eq("day_of_week", dow);
  if (ownYear) await admin.from("academic_years").delete().eq("id", year);
  await admin.from("levels").delete().eq("id", level);
  await admin.from("subjects").delete().eq("id", subject);
}
