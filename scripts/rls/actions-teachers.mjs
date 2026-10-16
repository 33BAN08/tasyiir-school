// Phase 5 step 4 Server Actions (a teacher's subjects), called over HTTP as
// real users on the page that registers them (/teachers).
import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin } from "./fixtures.mjs";

const PAGE = "/fr/teachers";
const SET = actionId("src/lib/teachers/teacher-actions.ts", "setTeacherSubjects");

export async function teacherActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const tch = fx.users.tchA.id;
  const cookies = {};
  for (const name of ["dirA", "survA", "dirB"]) cookies[name] = await sessionCookies(fx.users[name]);
  const call = (who, ...args) => callAction(baseUrl, { id: SET, path: PAGE, args, cookies: cookies[who] });
  const expect = async (label, promise, wanted) => {
    const r = await promise;
    const got = r.ok ? "ok" : r.error;
    check(`[P5 teacher action] ${label}`, got === wanted, got);
    return r;
  };
  const subject = async (school, name) =>
    (await admin.from("subjects").insert({ school_id: school.id, name }).select("id").single()).data.id;
  const [math, fr, sci] = [await subject(A, "TA-Maths"), await subject(A, "TA-Français"), await subject(A, "TA-SVT")];
  const mathB = await subject(B, "TA-Maths");
  const saved = async () =>
    new Set((await admin.from("teacher_subjects").select("subject_id").eq("teacher_id", tch)).data.map((r) => r.subject_id));

  await expect("surveillant cannot set a teacher's subjects", call("survA", tch, [math]), "forbidden");
  const first = await expect("director sets two subjects", call("dirA", tch, [math, fr, math]), "ok");
  check("[P5 teacher action] …duplicates ignored, 2 added", first.ok && first.data.added === 2 && first.data.removed === 0, JSON.stringify(first.data));
  const second = await expect("director replaces them (keeps Maths, swaps Français for SVT)", call("dirA", tch, [math, sci]), "ok");
  const now = await saved();
  check("[P5 teacher action] …1 added, 1 removed, saved set is exact",
    second.ok && second.data.added === 1 && second.data.removed === 1 && now.size === 2 && now.has(math) && now.has(sci),
    JSON.stringify([...now]));
  await expect("another school's subject → subjectNotFound", call("dirA", tch, [math, sci, mathB]), "subjectNotFound");
  check("[P5 teacher action] …and nothing changes", (await saved()).size === 2, "");
  await expect("a surveillant account → notTeacher", call("dirA", fx.users.survA.id, [math]), "notTeacher");
  await expect("director B on school A's teacher → notTeacher (not one of B's teachers)", call("dirB", tch, [mathB]), "notTeacher");
  await expect("not a list → generic error", call("dirA", tch, "maths"), "generic");
  await expect("21 subjects → tooManySubjects",
    call("dirA", tch, Array.from({ length: 21 }, () => crypto.randomUUID())), "tooManySubjects");
  await expect("director clears every subject", call("dirA", tch, []), "ok");
  check("[P5 teacher action] …none left", (await saved()).size === 0, "");

  await admin.from("subjects").delete().in("id", [math, fr, sci, mathB]);
}
