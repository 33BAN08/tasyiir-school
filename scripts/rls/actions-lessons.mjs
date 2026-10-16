// Phase 6 step 2 Server Actions (add / change / delete a lesson), called over
// HTTP as real users on the page that registers them (/timetable). A refused
// booking says who is busy, with which class, when.
import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";

const FILE = "src/lib/timetable/lesson-actions.ts";
const PAGE = "/fr/timetable";

export async function lessonActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const tch = fx.users.tchA.id;
  const ids = Object.fromEntries(["createLesson", "updateLesson", "deleteLesson"].map((n) => [n, actionId(FILE, n)]));
  const cookies = {};
  for (const name of ["dirA", "survA", "audA", "tchA", "dirB"]) cookies[name] = await sessionCookies(fx.users[name]);
  const call = (who, action, ...args) => callAction(baseUrl, { id: ids[action], path: PAGE, args, cookies: cookies[who] });
  const expect = async (label, promise, wanted) => {
    const r = await promise;
    const got = r.ok ? "ok" : r.error;
    check(`[P6 lesson action] ${label}`, got === wanted, got);
    return r;
  };
  const id = async (query) => (await query.select("id").single()).data.id;

  // A week: Monday 08:00 and 09:00 lessons, a 10:00 break; two classes; a room.
  const year = await id(admin.from("academic_years").insert({
    school_id: A.id, label: "2064-2065", start_date: "2064-09-01", end_date: "2065-06-30", is_current: false,
  }));
  await admin.from("school_days").insert({ school_id: A.id, academic_year_id: year, day_of_week: 1 });
  const slot = (start, end, kind = "lesson") =>
    id(admin.from("time_slots").insert({ school_id: A.id, academic_year_id: year, day_of_week: 1, start_time: start, end_time: end, kind }));
  const s8 = await slot("08:00", "09:00");
  const s9 = await slot("09:00", "10:00");
  const brk = await slot("10:00", "10:15", "break");
  const level = await id(admin.from("levels").insert({ school_id: A.id, name: "LA-Niveau", cycle: "college" }));
  const klass = (name) => id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name }));
  const c1 = await klass("LA-1");
  const c2 = await klass("LA-2");
  const subject = (name) => id(admin.from("subjects").insert({ school_id: A.id, name }));
  const arabe = await subject("LA-Arabe");
  const anglais = await subject("LA-Anglais");
  const maths = await subject("LA-Maths");
  const room = await id(admin.from("rooms").insert({ school_id: A.id, name: "LA-Salle", capacity: 30 }));
  const dirA = await signIn(fx.users.dirA);
  await dirA.from("teacher_subjects").insert([arabe, anglais].map((s) => ({ school_id: A.id, teacher_id: tch, subject_id: s })));

  const book = (classId, timeSlotId, subjectId, roomId = "") => ({ classId, timeSlotId, subjectId, teacherId: tch, roomId });

  // --- Add ----------------------------------------------------------------------------
  const first = await expect("director adds a lesson", call("dirA", "createLesson", book(c1, s8, arabe, room)), "ok");
  const L1 = first.data?.id;
  const second = await expect("surveillant (timetable.manage) adds a lesson", call("survA", "createLesson", book(c1, s9, anglais)), "ok");
  const L2 = second.data?.id;

  const busy = await expect("the same teacher in another class at the same hour → teacherBusy",
    call("dirA", "createLesson", book(c2, s8, anglais)), "teacherBusy");
  // Earlier suites may rename the fixture teacher: compare with the saved name.
  const { data: teacherRow } = await admin.from("profiles").select("full_name").eq("id", tch).single();
  check("[P6 lesson action] …says who, with which class, when, on the teacher field",
    busy.field === "teacherId" && busy.conflict?.name === teacherRow.full_name && busy.conflict?.className === "LA-1"
      && busy.conflict?.day === 1 && busy.conflict?.start === "08:00" && busy.conflict?.end === "09:00",
    JSON.stringify({ field: busy.field, conflict: busy.conflict }));
  await expect("a second lesson in a taken cell → classBusy", call("dirA", "createLesson", book(c1, s8, anglais)), "classBusy");
  await expect("a lesson on a break → slotNotBookable", call("dirA", "createLesson", book(c2, brk, arabe)), "slotNotBookable");
  await expect("a subject the teacher does not teach → teacherNotForSubject",
    call("dirA", "createLesson", book(c2, s9, maths)), "teacherNotForSubject");
  await expect("missing subject → subjectRequired", call("dirA", "createLesson", { ...book(c2, s9, arabe), subjectId: "" }), "subjectRequired");
  await expect("staff without timetable.manage → forbidden", call("audA", "createLesson", book(c2, s9, arabe)), "forbidden");
  await expect("a teacher → forbidden", call("tchA", "createLesson", book(c2, s9, arabe)), "forbidden");
  await expect("director B on school A's cell → notFound", call("dirB", "createLesson", book(c2, s9, arabe)), "notFound");

  // Room busy: a second teacher (free at 08:00) wants L1's room.
  const email = `rls-test+${fx.run}-tch2la@example.com`;
  const { data: created } = await admin.auth.admin.createUser({ email, password: `${crypto.randomUUID()}Aa1`, email_confirm: true });
  const tch2 = created.user.id;
  fx.createdUserIds.push(tch2);
  await admin.from("profiles").insert({
    id: tch2, school_id: A.id, role_id: A.roles.teacher, full_name: "RLS tch2la", email, must_change_password: false,
  });
  await dirA.from("teacher_subjects").insert({ school_id: A.id, teacher_id: tch2, subject_id: maths });
  const roomBusy = await expect("another class wanting the same room at the same hour → roomBusy",
    call("dirA", "createLesson", { classId: c2, timeSlotId: s8, subjectId: maths, teacherId: tch2, roomId: room }), "roomBusy");
  check("[P6 lesson action] …names the room and the class using it",
    roomBusy.field === "roomId" && roomBusy.conflict?.name === "LA-Salle" && roomBusy.conflict?.className === "LA-1",
    JSON.stringify(roomBusy.conflict));
  await expect("changing a lesson while keeping its own room is fine (not busy with itself)",
    call("dirA", "updateLesson", L1, { subjectId: arabe, teacherId: tch, roomId: room }), "ok");
  // The second teacher takes LA-2 at 09:00; giving them LA-1's 09:00 lesson too is refused.
  await expect("second teacher gets LA-2 at 09:00",
    call("dirA", "createLesson", { classId: c2, timeSlotId: s9, subjectId: maths, teacherId: tch2, roomId: "" }), "ok");
  await expect("changing a lesson's teacher to one busy at that hour → teacherBusy",
    call("dirA", "updateLesson", L2, { subjectId: maths, teacherId: tch2, roomId: "" }), "teacherBusy");

  // --- Change ---------------------------------------------------------------------------
  await expect("director changes the subject of a lesson", call("dirA", "updateLesson", L1, { subjectId: anglais, teacherId: tch, roomId: "" }), "ok");
  const { data: changed } = await admin.from("lessons").select("subject_id, room_id").eq("id", L1).single();
  check("[P6 lesson action] …saved (subject Anglais, no room)", changed.subject_id === anglais && changed.room_id === null, JSON.stringify(changed));
  await expect("director B cannot change school A's lesson", call("dirB", "updateLesson", L1, { subjectId: arabe, teacherId: tch, roomId: "" }), "notFound");

  // --- Delete -------------------------------------------------------------------------
  await expect("director B cannot delete school A's lesson", call("dirB", "deleteLesson", L1), "notFound");
  await expect("a teacher cannot delete a lesson", call("tchA", "deleteLesson", L1), "forbidden");
  await expect("director deletes a lesson", call("dirA", "deleteLesson", L1), "ok");
  await expect("…then the same teacher can take 1AC at 08:00 in another class", call("dirA", "createLesson", book(c2, s8, arabe)), "ok");

  // Clean up.
  await admin.from("lessons").delete().eq("academic_year_id", year);
  await admin.from("teacher_subjects").delete().eq("teacher_id", tch).in("subject_id", [arabe, anglais]);
  await admin.from("classes").delete().in("id", [c1, c2]);
  await admin.from("academic_years").delete().eq("id", year);
  await admin.from("levels").delete().eq("id", level);
  await admin.from("subjects").delete().in("id", [arabe, anglais, maths]);
  await admin.from("rooms").delete().eq("id", room);
}
