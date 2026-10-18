// Phase 6 step 5 Server Actions (copy a class's timetable from an earlier
// year), called over HTTP as real users on the page that registers them
// (/timetable). The preview names each lesson and why it is skipped; the copy
// does exactly that, once, into an empty class of the current year.
import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";

const FILE = "src/lib/timetable/copy-actions.ts";
const PAGE = "/fr/timetable";

export async function lessonCopyActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const tch = fx.users.tchA.id;
  const ids = Object.fromEntries(["previewCopy", "copyLessons"].map((n) => [n, actionId(FILE, n)]));
  const cookies = {};
  for (const name of ["dirA", "survA", "audA", "tchA", "dirB"]) cookies[name] = await sessionCookies(fx.users[name]);
  const call = (who, action, ...args) => callAction(baseUrl, { id: ids[action], path: PAGE, args, cookies: cookies[who] });
  const expect = async (label, promise, wanted) => {
    const r = await promise;
    const got = r.ok ? "ok" : r.error;
    check(`[P6 copy action] ${label}`, got === wanted, got);
    return r;
  };
  const id = async (query) => (await query.select("id").single()).data.id;

  // Last year (2055) and a current year (2056), Monday 08:00 and 09:00 in both.
  const currentBefore = (await admin.from("academic_years").select("id").eq("school_id", A.id).eq("is_current", true).maybeSingle()).data?.id;
  const year = (y, current) => id(admin.from("academic_years").insert({
    school_id: A.id, label: `${y}-${y + 1}`, start_date: `${y}-09-01`, end_date: `${y + 1}-06-30`, is_current: current,
  }));
  const yPrev = await year(2055, false);
  const yCur = await year(2056, true);
  const slots = {};
  for (const y of [yPrev, yCur]) {
    await admin.from("school_days").insert({ school_id: A.id, academic_year_id: y, day_of_week: 1 });
    for (const [start, end] of [["08:00", "09:00"], ["09:00", "10:00"]]) {
      slots[`${y}-${start}`] = await id(admin.from("time_slots").insert({
        school_id: A.id, academic_year_id: y, day_of_week: 1, start_time: start, end_time: end, kind: "lesson",
      }));
    }
  }
  const level = await id(admin.from("levels").insert({ school_id: A.id, name: "LK-Niveau", cycle: "college" }));
  const klass = (y, name) => id(admin.from("classes").insert({ school_id: A.id, academic_year_id: y, level_id: level, name }));
  const src = await klass(yPrev, "LK-1");
  const srcEmpty = await klass(yPrev, "LK-9");
  const target = await klass(yCur, "LK-1");
  const other = await klass(yCur, "LK-2");
  const emptyCur = await klass(yCur, "LK-3");
  const arabe = await id(admin.from("subjects").insert({ school_id: A.id, name: "LK-Arabe" }));
  const anglais = await id(admin.from("subjects").insert({ school_id: A.id, name: "LK-Anglais" }));
  const room = await id(admin.from("rooms").insert({ school_id: A.id, name: "LK-Salle", capacity: 30 }));
  const dirA = await signIn(fx.users.dirA);
  await dirA.from("teacher_subjects").insert([arabe, anglais].map((s) => ({ school_id: A.id, teacher_id: tch, subject_id: s })));
  const lesson = (y, classId, start, subjectId, roomId = null) => admin.from("lessons").insert({
    school_id: A.id, academic_year_id: y, time_slot_id: slots[`${y}-${start}`], class_id: classId,
    subject_id: subjectId, teacher_id: tch, room_id: roomId,
  });
  await lesson(yPrev, src, "08:00", arabe, room); // → copied with its room
  await lesson(yPrev, src, "09:00", anglais); //     → the teacher has LK-2 at 09:00 this year
  await lesson(yCur, other, "09:00", anglais);
  const { data: teacherRow } = await admin.from("profiles").select("full_name").eq("id", tch).single();

  // --- Preview -------------------------------------------------------------------------------
  const preview = await expect("director previews", call("dirA", "previewCopy", src, target), "ok");
  const lines = preview.data ?? [];
  check("[P6 copy action] …each lesson with its day, hours, subject, teacher, room and outcome",
    lines.length === 2
      && lines[0].status === "copy" && lines[0].day === 1 && lines[0].start === "08:00" && lines[0].end === "09:00"
      && lines[0].subjectName === "LK-Arabe" && lines[0].teacherName === teacherRow.full_name && lines[0].roomName === "LK-Salle"
      && lines[1].status === "teacher_busy" && lines[1].subjectName === "LK-Anglais",
    JSON.stringify(lines));
  const count = async () => (await admin.from("lessons").select("id").eq("class_id", target)).data.length;
  check("[P6 copy action] …copies nothing", (await count()) === 0);

  await expect("staff without timetable.manage → forbidden", call("audA", "previewCopy", src, target), "forbidden");
  await expect("a teacher → forbidden", call("tchA", "copyLessons", src, target), "forbidden");
  await expect("director B on school A's classes → notFound", call("dirB", "copyLessons", src, target), "notFound");
  await expect("not an id → notFound", call("dirA", "previewCopy", "nope", target), "notFound");
  await expect("into a class of last year → targetNotCurrent", call("dirA", "copyLessons", src, srcEmpty), "targetNotCurrent");
  await expect("from a class of this year → sourceNotEarlier", call("dirA", "copyLessons", other, emptyCur), "sourceNotEarlier");
  await expect("into a class that has lessons → targetNotEmpty", call("dirA", "copyLessons", src, other), "targetNotEmpty");

  // --- Copy --------------------------------------------------------------------------------------
  const done = await expect("surveillant copies", call("survA", "copyLessons", src, target), "ok");
  check("[P6 copy action] …returns what was done (1 copied, 1 skipped)",
    done.data?.filter((l) => l.status === "copy").length === 1 && done.data?.length === 2, JSON.stringify(done.data));
  check("[P6 copy action] …one lesson in the class", (await count()) === 1);
  await expect("copying again → targetNotEmpty", call("dirA", "copyLessons", src, target), "targetNotEmpty");
  const { data: audit } = await admin.from("audit_logs").select("data").eq("action", "lesson.copy").eq("entity_id", target);
  check("[P6 copy action] …audited once", audit?.length === 1 && audit[0].data.copied === 1 && audit[0].data.skipped === 1, JSON.stringify(audit));

  // Clean up.
  await admin.from("lessons").delete().in("academic_year_id", [yPrev, yCur]);
  await admin.from("teacher_subjects").delete().in("subject_id", [arabe, anglais]);
  await admin.from("classes").delete().in("academic_year_id", [yPrev, yCur]);
  await admin.from("academic_years").delete().in("id", [yPrev, yCur]);
  if (currentBefore) await admin.from("academic_years").update({ is_current: true }).eq("id", currentBefore);
  await admin.from("levels").delete().eq("id", level);
  await admin.from("subjects").delete().in("id", [arabe, anglais]);
  await admin.from("rooms").delete().eq("id", room);
}
