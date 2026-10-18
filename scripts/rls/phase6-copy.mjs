// Phase 6 step 5: copy_class_lessons() (database level). A class of an earlier
// year is copied into an EMPTY class of the current year: same day + start/end
// time; a lesson is skipped when the slot is missing (or now a break), the
// teacher is deactivated or busy then; a busy room is dropped, the lesson kept.
// apply = false only reports; apply = true inserts everything in one statement.
// Only timetable.manage of the school; never another school's classes.
import { randomBytes } from "node:crypto";

import { check } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";

export async function phase6Copy({ fx, as }) {
  const A = fx.schools.a;
  const { dirA, survA, tchA, audA, dirB } = as;
  const tch = fx.users.tchA.id;

  const must = (r, what) => {
    if (r.error) throw new Error(`phase6Copy setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (query, what) => must(await query.select("id").single(), what).id;
  const refused = async (label, query, wanted) => {
    const { error } = await query;
    const got = error ? (error.code === "P0001" ? error.message : error.code) : "ACCEPTED!";
    check(`[P6 copy] ${label}`, got === wanted, error ? `${error.code} ${error.message}` : got);
  };

  // --- Accounts: two more teachers in A ------------------------------------------------------
  const teacher = async (name) => {
    const email = `rls-test+${fx.run}-${name}@example.com`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), `user ${name}`).user;
    fx.createdUserIds.push(user.id);
    must(await admin.from("profiles").insert({
      id: user.id, school_id: A.id, role_id: A.roles.teacher, full_name: `RLS ${name}`, email, must_change_password: false,
    }), `profile ${name}`);
    return user.id;
  };
  const tchGone = await teacher("p6cgone"); // deactivated after last year
  const tchPhys = await teacher("p6cphys");

  // --- Two years: last year (2057) and the current one (2058) --------------------------------
  const currentBefore = (await admin.from("academic_years").select("id").eq("school_id", A.id).eq("is_current", true).maybeSingle()).data?.id;
  const year = (y, current) => id(admin.from("academic_years").insert({
    school_id: A.id, label: `${y}-${y + 1}`, start_date: `${y}-09-01`, end_date: `${y + 1}-06-30`, is_current: current,
  }), `year ${y}`);
  const yPrev = await year(2057, false);
  const yCur = await year(2058, true);
  for (const y of [yPrev, yCur]) must(await admin.from("school_days").insert({ school_id: A.id, academic_year_id: y, day_of_week: 1 }), "day");
  const slot = (y, start, end, kind = "lesson") =>
    id(admin.from("time_slots").insert({ school_id: A.id, academic_year_id: y, day_of_week: 1, start_time: start, end_time: end, kind }), "slot");
  const P = {};
  const C = {};
  for (const [start, end] of [["08:00", "09:00"], ["09:00", "10:00"], ["10:00", "11:00"], ["11:00", "12:00"]]) {
    P[start] = await slot(yPrev, start, end);
    C[start] = await slot(yCur, start, end);
  }
  P["14:00"] = await slot(yPrev, "14:00", "15:00");
  await slot(yCur, "14:00", "15:00", "break"); // 14:00 is a break this year

  const level = await id(admin.from("levels").insert({ school_id: A.id, name: "LC-Niveau", cycle: "college" }), "level");
  const klass = (y, name) => id(admin.from("classes").insert({ school_id: A.id, academic_year_id: y, level_id: level, name }), `class ${name}`);
  const src = await klass(yPrev, "LC-1"); // last year's timetable
  const srcEmpty = await klass(yPrev, "LC-9");
  const target = await klass(yCur, "LC-1");
  const other = await klass(yCur, "LC-2");
  const busyTarget = await klass(yCur, "LC-3");
  const emptyCur = await klass(yCur, "LC-4");

  const subject = (name) => id(admin.from("subjects").insert({ school_id: A.id, name }), `subject ${name}`);
  const arabe = await subject("LC-Arabe");
  const anglais = await subject("LC-Anglais");
  const maths = await subject("LC-Maths");
  const physique = await subject("LC-Physique");
  const room = await id(admin.from("rooms").insert({ school_id: A.id, name: "LC-Salle", capacity: 30 }), "room");
  const dirAClient = await signIn(fx.users.dirA);
  must(await dirAClient.from("teacher_subjects").insert([
    { school_id: A.id, teacher_id: tch, subject_id: arabe },
    { school_id: A.id, teacher_id: tch, subject_id: anglais },
    { school_id: A.id, teacher_id: tchGone, subject_id: maths },
    { school_id: A.id, teacher_id: tchPhys, subject_id: physique },
  ]), "teacher subjects");

  const lesson = (y, classId, slotId, subjectId, teacherId, roomId = null) => id(admin.from("lessons").insert({
    school_id: A.id, academic_year_id: y, time_slot_id: slotId, class_id: classId, subject_id: subjectId, teacher_id: teacherId, room_id: roomId,
  }), "lesson");
  // Last year, LC-1 (Monday):
  const L8 = await lesson(yPrev, src, P["08:00"], arabe, tch, room); //   → copied with its room
  const L9 = await lesson(yPrev, src, P["09:00"], anglais, tch, room); // → teacher busy with LC-2
  const L10 = await lesson(yPrev, src, P["10:00"], maths, tchGone); //    → teacher deactivated
  const L11 = await lesson(yPrev, src, P["11:00"], arabe, tch, room); //  → copied, room taken by LC-2
  const L14 = await lesson(yPrev, src, P["14:00"], anglais, tch); //      → 14:00 is a break now
  // This year: LC-2 keeps the teacher busy at 09:00 and the room at 11:00; LC-3 is not empty.
  await lesson(yCur, other, C["09:00"], anglais, tch);
  await lesson(yCur, other, C["11:00"], physique, tchPhys, room);
  await lesson(yCur, busyTarget, C["08:00"], physique, tchPhys);
  must(await admin.from("profiles").update({ deactivated_at: new Date().toISOString() }).eq("id", tchGone), "deactivate");

  const targetLessons = async () =>
    (await admin.from("lessons").select("time_slot_id, subject_id, teacher_id, room_id").eq("class_id", target)).data;

  // --- Preview --------------------------------------------------------------------------------
  const preview = await dirA.rpc("copy_class_lessons", { p_from_class: src, p_to_class: target });
  const report = (preview.data ?? []).map((r) => `${r.source_lesson_id}:${r.target_slot_id}:${r.status}`);
  const wanted = [
    `${L8}:${C["08:00"]}:copy`,
    `${L9}:${C["09:00"]}:teacher_busy`,
    `${L10}:${C["10:00"]}:teacher_inactive`,
    `${L11}:${C["11:00"]}:room_busy`,
    `${L14}:null:no_slot`,
  ];
  check("[P6 copy] preview: one line per lesson, in week order, with its reason",
    !preview.error && JSON.stringify(report) === JSON.stringify(wanted), preview.error?.message ?? JSON.stringify(preview.data));
  check("[P6 copy] preview copies nothing", (await targetLessons()).length === 0);

  // --- Refusals ---------------------------------------------------------------------------------
  await refused("staff without timetable.manage", audA.rpc("copy_class_lessons", { p_from_class: src, p_to_class: target, p_apply: true }), "42501");
  await refused("a teacher", tchA.rpc("copy_class_lessons", { p_from_class: src, p_to_class: target, p_apply: true }), "42501");
  await refused("director of school B (classes of A are invisible)",
    dirB.rpc("copy_class_lessons", { p_from_class: src, p_to_class: target, p_apply: true }), "copy_lessons_not_found");
  await refused("target class not of the current year",
    dirA.rpc("copy_class_lessons", { p_from_class: src, p_to_class: srcEmpty, p_apply: true }), "copy_lessons_target_not_current");
  await refused("source class not of an earlier year",
    dirA.rpc("copy_class_lessons", { p_from_class: other, p_to_class: emptyCur, p_apply: true }), "copy_lessons_source_not_earlier");
  await refused("target class that already has lessons",
    dirA.rpc("copy_class_lessons", { p_from_class: src, p_to_class: busyTarget, p_apply: true }), "copy_lessons_target_not_empty");
  check("[P6 copy] refusals copied nothing", (await targetLessons()).length === 0);

  // --- Copy -------------------------------------------------------------------------------------
  const applied = await survA.rpc("copy_class_lessons", { p_from_class: src, p_to_class: target, p_apply: true });
  check("[P6 copy] surveillant (timetable.manage) copies: same report as the preview",
    !applied.error && JSON.stringify(applied.data) === JSON.stringify(preview.data), applied.error?.message ?? "");
  const copied = (await targetLessons()).sort((a, b) => Number(b.time_slot_id === C["08:00"]) - Number(a.time_slot_id === C["08:00"]));
  check("[P6 copy] 2 lessons copied: 08:00 with its room, 11:00 without (room taken)",
    copied.length === 2
      && copied[0].time_slot_id === C["08:00"] && copied[0].room_id === room && copied[0].teacher_id === tch && copied[0].subject_id === arabe
      && copied[1].time_slot_id === C["11:00"] && copied[1].room_id === null,
    JSON.stringify(copied));
  await refused("copying again into the now non-empty class",
    dirA.rpc("copy_class_lessons", { p_from_class: src, p_to_class: target, p_apply: true }), "copy_lessons_target_not_empty");

  // --- Clean up -----------------------------------------------------------------------------------
  await admin.from("lessons").delete().in("academic_year_id", [yPrev, yCur]);
  await admin.from("teacher_subjects").delete().in("subject_id", [arabe, anglais, maths, physique]);
  await admin.from("classes").delete().in("academic_year_id", [yPrev, yCur]);
  await admin.from("academic_years").delete().in("id", [yPrev, yCur]);
  if (currentBefore) await admin.from("academic_years").update({ is_current: true }).eq("id", currentBefore);
  await admin.from("levels").delete().eq("id", level);
  await admin.from("subjects").delete().in("id", [arabe, anglais, maths, physique]);
  await admin.from("rooms").delete().eq("id", room);
}
