// Phase 5: parents from a STUDENT's page (/students/[id]) — search, create + link
// in one step, link an existing guardian, unlink. Called over HTTP as real users
// on the page that registers them.
import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin } from "./fixtures.mjs";
import { randomMobile } from "./phase5-guardians.mjs";

const PAGE = "/fr/students/:id";
const ACTIONS = {
  "src/lib/parents/student-guardian-actions.ts": ["searchGuardiansToLink", "createGuardianForStudent"],
  "src/lib/parents/guardian-actions.ts": ["linkChild", "unlinkChild"],
};

export async function studentGuardianActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const ids = Object.fromEntries(
    Object.entries(ACTIONS).flatMap(([file, names]) => names.map((n) => [n, actionId(file, n)])),
  );
  const cookies = {};
  for (const name of ["dirA", "survA", "dirB"]) cookies[name] = await sessionCookies(fx.users[name]);

  const kid = async (school, lastName) =>
    (await admin
      .from("students")
      .insert({ school_id: school.id, first_name: "Kid", last_name: lastName, birth_date: "2014-01-01", gender: "male" })
      .select("id")
      .single()).data.id;
  const kidA = await kid(A, "SGKIDA");
  const kidA2 = await kid(A, "SGKIDA2");
  const kidB = await kid(B, "SGKIDB");
  const pageOf = { dirA: kidA, survA: kidA, dirB: kidB };

  const call = (who, action, ...args) =>
    callAction(baseUrl, { id: ids[action], path: PAGE.replace(":id", pageOf[who]), args, cookies: cookies[who] });
  const expect = async (label, promise, wanted, field) => {
    const r = await promise;
    const got = r.ok ? "ok" : r.error;
    const pass = got === wanted && (field === undefined || r.field === field);
    check(`[P5 student page] ${label}`, pass, field ? `${got} (${r.field})` : got);
    return r;
  };
  const form = (phone, relation, extra = {}) => ({ lastName: "Tazi", firstName: "Samira", phone, email: "", relation, ...extra });
  const countGuardians = async (phone) =>
    (await admin.from("guardians").select("id", { count: "exact", head: true }).eq("phone", phone)).count;

  // --- Create + link in one step ---------------------------------------------------------
  const phoneMother = randomMobile();
  await expect("surveillant (students.view only) cannot create a parent",
    call("survA", "createGuardianForStudent", kidA, form(phoneMother, "mother")), "forbidden");
  await expect("missing relation → relationRequired",
    call("dirA", "createGuardianForStudent", kidA, form(phoneMother, "")), "relationRequired", "relation");
  const created = await expect("director creates the mother from the student's page",
    call("dirA", "createGuardianForStudent", kidA, form(phoneMother, "mother")), "ok");
  const motherId = created.ok ? created.data.id : null;
  const { data: link } = await admin.from("student_guardians").select("relation, school_id").eq("guardian_id", motherId).eq("student_id", kidA).maybeSingle();
  check("[P5 student page] …linked as mother, in the director's school", link?.relation === "mother" && link?.school_id === A.id, JSON.stringify(link));

  const phoneSecond = randomMobile();
  await expect("a second mother → relationTaken",
    call("dirA", "createGuardianForStudent", kidA, form(phoneSecond, "mother")), "relationTaken", "relation");
  check("[P5 student page] …and no guardian is left behind", (await countGuardians(phoneSecond)) === 0, "");
  await expect("the mother's phone again → phoneTaken",
    call("dirA", "createGuardianForStudent", kidA, form(phoneMother, "tutor")), "phoneTaken", "phone");
  const phoneCross = randomMobile();
  await expect("director A on school B's student → studentNotFound",
    call("dirA", "createGuardianForStudent", kidB, form(phoneCross, "tutor")), "studentNotFound");
  check("[P5 student page] …and no guardian is left behind", (await countGuardians(phoneCross)) === 0, "");

  // --- Search ---------------------------------------------------------------------------
  const byPhone = await call("dirA", "searchGuardiansToLink", `0${phoneMother.slice(4, 8)}`);
  check("[P5 student page] search by phone finds the mother",
    byPhone.ok && byPhone.data.some((g) => g.id === motherId), JSON.stringify(byPhone.data ?? byPhone.error));
  const fromB = await call("dirB", "searchGuardiansToLink", "tazi");
  check("[P5 student page] director B's search never returns school A's parents",
    fromB.ok && !fromB.data.some((g) => g.id === motherId), JSON.stringify(fromB.data ?? fromB.error));
  await expect("surveillant cannot search parents", call("survA", "searchGuardiansToLink", "tazi"), "forbidden");

  // --- Link the existing guardian to a sibling, then unlink --------------------------------
  pageOf.dirA = kidA2;
  await expect("director links the same mother to a sibling",
    call("dirA", "linkChild", motherId, { studentId: kidA2, relation: "mother" }), "ok");
  await expect("director B cannot link school A's parent",
    call("dirB", "linkChild", motherId, { studentId: kidB, relation: "tutor" }), "notFound");
  await expect("director removes the sibling's link", call("dirA", "unlinkChild", motherId, kidA2), "ok");
  const { count: stillThere } = await admin.from("guardians").select("id", { count: "exact", head: true }).eq("id", motherId);
  check("[P5 student page] …the parent itself is kept", stillThere === 1, "");

  // Leave nothing for the next suites.
  await admin.from("guardians").delete().in("school_id", [A.id, B.id]);
  await admin.from("students").delete().in("id", [kidA, kidA2, kidB]);
}
