// Phase 6 step 4 Server Actions (drag & drop: move a lesson, swap two), called
// over HTTP as real users on the page that registers them (/timetable). A
// refused move says who is busy, with which class, when; a swap is all or
// nothing and is checked for both lessons.
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

  // Monday 08:00–12:00 (four lessons) and a 12:00 break; two classes; one room; two teachers.
  const year = await id(admin.from("academic_years").insert({
    school_id: A.id, label: "2066-2067", start_date: "2066-09-01", end_date: "2067-06-30", is_current: false,
  }));
  await admin.from("school_days").insert({ school_id: A.id, academic_year_id: year, day_of_week: 1 });
  const slot = (start, end, kind = "lesson") =>
    id(admin.from("time_slots").insert({ school_id: A.id, academic_year_id: year, day_of_week: 1, start_time: start, end_time: end, kind }));
  const s8 = await slot("08:00", "09:00");
  const s9 = await slot("09:00", "10:00");
  const s10 = await slot("10:00", "11:00");
  const s11 = await slot("11:00", "12:00");
  const brk = await slot("12:00", "12:15", "break");
  const level = await id(admin.from("levels").insert({ school_id: A.id, name: "LM-Niveau", cycle: "college" }));
  const klass = (name) => id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name }));
  const c1 = await klass("LM-1");
  const c2 = await klass("LM-2");
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
    id(admin.from("lessons").insert({
      school_id: A.id, academic_year_id: year, time_slot_id: timeSlotId, class_id: classId,
      subject_id: subjectId, teacher_id: teacherId, room_id: roomId,
    }));
  const L1 = await lesson(c1, s8, arabe, tch, room); // LM-1 08:00, teacher 1, the room
  const L2 = await lesson(c1, s9, anglais, tch); // LM-1 09:00, teacher 1
  const M = await lesson(c2, s10, maths, tch2, room); // LM-2 10:00, teacher 2, the room
  await lesson(c2, s9, maths, tch2); // LM-2 09:00, teacher 2
  await lesson(c2, s11, arabe, tch); // LM-2 11:00, teacher 1

  // --- Move ------------------------------------------------------------------------------
  const busy = await expect("moving a lesson to a slot where its teacher teaches another class → teacherBusy",
    call("dirA", "moveLesson", L1, s11), "teacherBusy");
  check("[P6 move action] …says with which class and when",
    busy.conflict?.kind === "teacher" && busy.conflict?.className === "LM-2" && busy.conflict?.start === "11:00",
    JSON.stringify(busy.conflict));
  const roomBusy = await expect("…where its room is taken → roomBusy", call("dirA", "moveLesson", L1, s10), "roomBusy");
  check("[P6 move action] …names the room and the class using it",
    roomBusy.conflict?.name === "LM-Salle" && roomBusy.conflict?.className === "LM-2", JSON.stringify(roomBusy.conflict));
  await expect("…where its class already has a lesson → classBusy", call("dirA", "moveLesson", L1, s9), "classBusy");
  await expect("…onto a break → slotNotBookable", call("dirA", "moveLesson", L1, brk), "slotNotBookable");
  check("[P6 move action] refused moves change nothing", (await slotOf(L1)) === s8);

  await expect("director moves a lesson to a free slot", call("dirA", "moveLesson", L2, s10), "ok");
  check("[P6 move action] …saved", (await slotOf(L2)) === s10);
  await expect("surveillant (timetable.manage) moves it back (undo)", call("survA", "moveLesson", L2, s9), "ok");
  check("[P6 move action] …back at 09:00", (await slotOf(L2)) === s9);
  await expect("moving to its own slot is a no-op", call("dirA", "moveLesson", L2, s9), "ok");

  await expect("staff without timetable.manage → forbidden", call("audA", "moveLesson", L2, s10), "forbidden");
  await expect("a teacher → forbidden", call("tchA", "moveLesson", L2, s10), "forbidden");
  await expect("director B on school A's lesson → notFound", call("dirB", "moveLesson", L2, s10), "notFound");
  await expect("not an id → notFound", call("dirA", "moveLesson", "nope", s10), "notFound");

  // --- Swap ------------------------------------------------------------------------------
  await expect("director swaps two lessons of a class", call("dirA", "swapLessons", L1, L2), "ok");
  check("[P6 move action] …slots exchanged", (await slotOf(L1)) === s9 && (await slotOf(L2)) === s8);
  await expect("swapping again puts them back (undo)", call("dirA", "swapLessons", L1, L2), "ok");
  check("[P6 move action] …back", (await slotOf(L1)) === s8 && (await slotOf(L2)) === s9);

  await expect("swapping lessons of two classes that share a room (each takes the other's place)",
    call("dirA", "swapLessons", L1, M), "ok");
  check("[P6 move action] …exchanged", (await slotOf(L1)) === s10 && (await slotOf(M)) === s8);
  await expect("…and back", call("dirA", "swapLessons", L1, M), "ok");

  const otherSide = await expect("a swap where the OTHER lesson's class is busy at the first one's slot → classBusy",
    call("dirA", "swapLessons", L2, M), "classBusy");
  check("[P6 move action] …explains the other lesson's conflict (LM-2 at 09:00)",
    otherSide.conflict?.className === "LM-2" && otherSide.conflict?.start === "09:00", JSON.stringify(otherSide.conflict));
  check("[P6 move action] refused swap changes nothing", (await slotOf(L2)) === s9 && (await slotOf(M)) === s10);

  await expect("a lesson with itself → notFound", call("dirA", "swapLessons", L1, L1), "notFound");
  await expect("staff without timetable.manage → forbidden", call("audA", "swapLessons", L1, L2), "forbidden");
  await expect("director B on school A's lessons → notFound", call("dirB", "swapLessons", L1, L2), "notFound");

  // Clean up.
  await admin.from("lessons").delete().eq("academic_year_id", year);
  await admin.from("teacher_subjects").delete().in("subject_id", [arabe, anglais, maths]);
  await admin.from("classes").delete().in("id", [c1, c2]);
  await admin.from("academic_years").delete().eq("id", year);
  await admin.from("levels").delete().eq("id", level);
  await admin.from("subjects").delete().in("id", [arabe, anglais, maths]);
  await admin.from("rooms").delete().eq("id", room);
}
