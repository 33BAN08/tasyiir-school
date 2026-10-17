// Phase 6 step 4 Server Actions (drag & drop: move a lesson, swap two), called
// over HTTP as real users on the page that registers them (/timetable). A
// refused move says who is busy, with which class, when; a refused swap
// changes nothing.
import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";

const FILE = "src/lib/timetable/move-actions.ts";
const PAGE = "/fr/timetable";

export async function lessonMoveActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const tch = fx.users.tchA.id;
  const ids = Object.fromEntries(["moveLesson", "swapLessons"].map((n) => [n, actionId(FILE, n)]));
  const cookies = {};
  for (const name of ["dirA", "survA", "audA", "tchA", "dirB"]) cookies[name] = await sessionCookies(fx.users[name]);
  const call = (who, action, ...args) => callAction(baseUrl, { id: ids[action], path: PAGE, args, cookies: cookies[who] });
  const expect = async (label, promise, wanted) => {
    const r = await promise;
    const got = r.ok ? "ok" : r.error;
    check(`[P6 move action] ${label}`, got === wanted, got);
    return r;
  };
  const id = async (query) => (await query.select("id").single()).data.id;
  const slotOf = async (lessonId) => (await admin.from("lessons").select("time_slot_id").eq("id", lessonId).single()).data.time_slot_id;

  // Monday: lessons at 08:00, 09:00, 10:00, 11:00, a 10:45 break; three classes; one room.
  const year = await id(admin.from("academic_years").insert({
    school_id: A.id, label: "2066-2067", start_date: "2066-09-01", end_date: "2067-06-30", is_current: false,
  }));
  await admin.from("school_days").insert({ school_id: A.id, academic_year_id: year, day_of_week: 1 });
  const slot = (start, end, kind = "lesson") =>
    id(admin.from("time_slots").insert({ school_id: A.id, academic_year_id: year, day_of_week: 1, start_time: start, end_time: end, kind }));
  const s8 = await slot("08:00", "09:00");
  const s9 = await slot("09:00", "10:00");
  const s10 = await slot("10:00", "10:45");
  const brk = await slot("10:45", "11:00", "break");
  const s11 = await slot("11:00", "12:00");
  const level = await id(admin.from("levels").insert({ school_id: A.id, name: "LM-Niveau", cycle: "college" }));
  const klass = (name) => id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name }));
  const c1 = await klass("LM-1");
  const c2 = await klass("LM-2");
  const c3 = await klass("LM-3");
  const subject = (name) => id(admin.from("subjects").insert({ school_id: A.id, name }));
  const arabe = await subject("LM-Arabe");
  const anglais = await subject("LM-Anglais");
  const maths = await subject("LM-Maths");
  const room = await id(admin.from("rooms").insert({ school_id: A.id, name: "LM-Salle", capacity: 30 }));

  const email = `rls-test+${fx.run}-tch2lm@example.com`;
  const { data: created } = await admin.auth.admin.createUser({ email, password: `${crypto.randomUUID()}Aa1`, email_confirm: true });
  const tch2 = created.user.id;
  fx.createdUserIds.push(tch2);
  await admin.from("profiles").insert({
    id: tch2, school_id: A.id, role_id: A.roles.teacher, full_name: "RLS tch2lm", email, must_change_password: false,
  });
  const dirA = await signIn(fx.users.dirA);
  await dirA.from("teacher_subjects").insert([
    ...[arabe, anglais].map((s) => ({ school_id: A.id, teacher_id: tch, subject_id: s })),
    { school_id: A.id, teacher_id: tch2, subject_id: maths },
  ]);
  const lesson = (classId, timeSlotId, subjectId, teacherId, roomId = null) =>
    id(dirA.from("lessons").insert({
      school_id: A.id, academic_year_id: year, time_slot_id: timeSlotId, class_id: classId, subject_id: subjectId, teacher_id: teacherId, room_id: roomId,
    }));
  const LA = await lesson(c1, s8, arabe, tch, room); // LM-1 08:00, room
  const LB = await lesson(c1, s9, anglais, tch); //     LM-1 09:00
  const LC = await lesson(c2, s10, anglais, tch); //    LM-2 10:00
  const LE = await lesson(c3, s9, maths, tch2, room); // LM-3 09:00, room

  // --- Move -------------------------------------------------------------------------
  await expect("dropping a lesson on its own cell changes nothing", call("dirA", "moveLesson", LA, s8), "ok");
  await expect("onto a slot where its class already has a lesson → classBusy", call("dirA", "moveLesson", LA, s9), "classBusy");
  const busy = await expect("onto a slot where its teacher teaches another class → teacherBusyMove",
    call("dirA", "moveLesson", LB, s10), "teacherBusyMove");
  const { data: teacherRow } = await admin.from("profiles").select("full_name").eq("id", tch).single();
  check("[P6 move action] …says who, with which class, when",
    busy.conflict?.name === teacherRow.full_name && busy.conflict?.className === "LM-2"
      && busy.conflict?.day === 1 && busy.conflict?.start === "10:00" && busy.conflict?.end === "10:45",
    JSON.stringify(busy.conflict));
  const roomBusy = await expect("onto a slot where its room is used → roomBusy", call("dirA", "moveLesson", LE, s8), "roomBusy");
  check("[P6 move action] …names the room and the class using it",
    roomBusy.conflict?.name === "LM-Salle" && roomBusy.conflict?.className === "LM-1", JSON.stringify(roomBusy.conflict));
  await expect("onto a break → slotNotBookable", call("dirA", "moveLesson", LB, brk), "slotNotBookable");
  await expect("staff without timetable.manage → forbidden", call("audA", "moveLesson", LB, s11), "forbidden");
  await expect("a teacher → forbidden", call("tchA", "moveLesson", LB, s11), "forbidden");
  await expect("director B on school A's lesson → notFound", call("dirB", "moveLesson", LB, s11), "notFound");
  await expect("not a lesson id → notFound", call("dirA", "moveLesson", "x", s11), "notFound");
  check("[P6 move action] refused moves left the lessons in place",
    (await slotOf(LA)) === s8 && (await slotOf(LB)) === s9 && (await slotOf(LE)) === s9, "");

  await expect("surveillant (timetable.manage) moves a lesson to a free slot", call("survA", "moveLesson", LB, s11), "ok");
  check("[P6 move action] …saved", (await slotOf(LB)) === s11, await slotOf(LB));
  await expect("…and back (undo)", call("dirA", "moveLesson", LB, s9), "ok");

  // --- Swap -------------------------------------------------------------------------
  // LM-1 08:00 (room) ↔ 09:00: the room is taken at 09:00 by LM-3 → refused, nothing changes.
  await expect("swap where one lesson's room is busy in the other slot → roomBusy", call("dirA", "swapLessons", LA, LB), "roomBusy");
  check("[P6 move action] …nothing changed", (await slotOf(LA)) === s8 && (await slotOf(LB)) === s9, "");
  await expect("a lesson with itself → notFound", call("dirA", "swapLessons", LA, LA), "notFound");
  await expect("staff without timetable.manage → forbidden", call("audA", "swapLessons", LA, LB), "forbidden");
  await expect("director B on school A's lessons → notFound", call("dirB", "swapLessons", LA, LB), "notFound");

  await expect("LM-3 moves to 11:00 (frees the room at 09:00)", call("dirA", "moveLesson", LE, s11), "ok");
  await expect("director swaps LM-1's 08:00 and 09:00 lessons", call("dirA", "swapLessons", LA, LB), "ok");
  check("[P6 move action] …both moved", (await slotOf(LA)) === s9 && (await slotOf(LB)) === s8, "");
  await expect("two lessons of the same teacher in different classes swap", call("dirA", "swapLessons", LA, LC), "ok");
  check("[P6 move action] …LM-1 at 10:00, LM-2 at 09:00", (await slotOf(LA)) === s10 && (await slotOf(LC)) === s9, "");
  await expect("swap again (undo)", call("dirA", "swapLessons", LA, LC), "ok");
  check("[P6 move action] …back in place", (await slotOf(LA)) === s9 && (await slotOf(LC)) === s10, "");

  // Clean up.
  await admin.from("lessons").delete().eq("academic_year_id", year);
  await admin.from("teacher_subjects").delete().in("subject_id", [arabe, anglais, maths]);
  await admin.from("classes").delete().in("id", [c1, c2, c3]);
  await admin.from("academic_years").delete().eq("id", year);
  await admin.from("levels").delete().eq("id", level);
  await admin.from("subjects").delete().in("id", [arabe, anglais, maths]);
  await admin.from("rooms").delete().eq("id", room);
}
