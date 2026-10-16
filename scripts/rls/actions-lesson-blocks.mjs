// Phase 6 step 1 Server Actions: what a timetable lesson still uses cannot be
// deleted or changed, and each action says why (its own error key). Called
// over HTTP as the director, each on the page that registers the action.
import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";

const at = (file, name, path) => ({ id: actionId(file, name), path });

export async function lessonBlockActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const tch = fx.users.tchA.id;
  const cookies = await sessionCookies(fx.users.dirA);
  const call = (action, ...args) => callAction(baseUrl, { ...action, args, cookies });
  const expect = async (label, promise, wanted) => {
    const r = await promise;
    const got = r.ok ? "ok" : r.error;
    check(`[P6 lesson blocks] ${label}`, got === wanted, got);
  };
  const id = async (query) => (await query.select("id").single()).data.id;

  // A lesson using a subject, a room, a time slot and the teacher.
  const year = await id(admin.from("academic_years").insert({
    school_id: A.id, label: "2062-2063", start_date: "2062-09-01", end_date: "2063-06-30", is_current: false,
  }));
  await admin.from("school_days").insert({ school_id: A.id, academic_year_id: year, day_of_week: 2 });
  const slot = await id(admin.from("time_slots").insert({
    school_id: A.id, academic_year_id: year, day_of_week: 2, start_time: "08:00", end_time: "09:00",
  }));
  const level = await id(admin.from("levels").insert({ school_id: A.id, name: "LB-Niveau", cycle: "college" }));
  const klass = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name: "LB-1" }));
  const subject = await id(admin.from("subjects").insert({ school_id: A.id, name: "LB-Maths" }));
  const room = await id(admin.from("rooms").insert({ school_id: A.id, name: "LB-Salle", capacity: 30 }));
  const dirA = await signIn(fx.users.dirA); // the teacher-role check trigger runs for signed-in users
  await dirA.from("teacher_subjects").insert({ school_id: A.id, teacher_id: tch, subject_id: subject });
  const lesson = await id(admin.from("lessons").insert({
    school_id: A.id, academic_year_id: year, time_slot_id: slot, class_id: klass, subject_id: subject, teacher_id: tch, room_id: room,
  }));
  check("[P6 lesson blocks] setup: a lesson exists", Boolean(lesson));

  await expect("deleting a subject used by lessons → subjectHasLessons",
    call(at("src/lib/structure/subject-actions.ts", "deleteSubject", "/fr/setup/subjects"), subject), "subjectHasLessons");
  await expect("deleting a room used by lessons → roomHasLessons",
    call(at("src/lib/structure/room-actions.ts", "deleteRoom", "/fr/setup/rooms"), room), "roomHasLessons");
  const slots = "src/lib/structure/time-slot-actions.ts";
  await expect("deleting a time slot used by lessons → slotHasLessons",
    call(at(slots, "deleteTimeSlot", "/fr/setup/time-slots"), slot), "slotHasLessons");
  await expect("turning a slot with lessons into a break → slotHasLessons",
    call(at(slots, "updateTimeSlot", "/fr/setup/time-slots"), slot, { startTime: "08:00", endTime: "09:00", kind: "break", label: "" }),
    "slotHasLessons");
  await expect("taking the subject away from its teacher → subjectHasLessons",
    call(at("src/lib/teachers/teacher-actions.ts", "setTeacherSubjects", "/fr/teachers"), tch, []), "subjectHasLessons");
  await expect("moving a teacher with lessons to another role → teacherHasLessons",
    callAction(baseUrl, {
      id: actionId("src/lib/staff/member-actions.ts", "changeStaffRole"),
      path: `/fr/staff/${tch}`,
      args: [tch, { roleId: A.roles.surveillant }],
      cookies,
    }),
    "teacherHasLessons");

  const { data: still } = await admin.from("profiles").select("role_id").eq("id", tch).single();
  check("[P6 lesson blocks] …the teacher keeps the teacher role", still.role_id === A.roles.teacher, "");

  // Clean up (the lesson first: it blocks everything else).
  await admin.from("lessons").delete().eq("id", lesson);
  await admin.from("teacher_subjects").delete().eq("teacher_id", tch).eq("subject_id", subject);
  await admin.from("classes").delete().eq("id", klass);
  await admin.from("academic_years").delete().eq("id", year);
  await admin.from("levels").delete().eq("id", level);
  await admin.from("subjects").delete().eq("id", subject);
  await admin.from("rooms").delete().eq("id", room);
}
