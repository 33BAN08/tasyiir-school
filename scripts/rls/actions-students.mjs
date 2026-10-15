// Phase 5 step 1 Server Actions (students + their class this year), called
// over HTTP as real users on the page that registers them.
import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin } from "./fixtures.mjs";

// file → [page that registers its actions, action names]
const ACTIONS = {
  "src/lib/students/student-actions.ts": ["/fr/students", ["createStudent", "updateStudent", "deleteStudent"]],
  "src/lib/structure/class-actions.ts": ["/fr/setup/classes", ["deleteClass"]],
};

export async function studentActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const ids = Object.fromEntries(
    Object.entries(ACTIONS).flatMap(([file, [path, names]]) => names.map((n) => [n, { id: actionId(file, n), path }])),
  );
  const cookies = {};
  for (const name of ["dirA", "survA", "tchA", "dirB"]) cookies[name] = await sessionCookies(fx.users[name]);

  const call = (who, action, ...args) => callAction(baseUrl, { ...ids[action], args, cookies: cookies[who] });
  const expect = async (label, promise, wanted, field) => {
    const r = await promise;
    const got = r.ok ? "ok" : r.error;
    const pass = got === wanted && (field === undefined || r.field === field);
    check(`[P5 action] ${label}`, pass, field ? `${got} (${r.field})` : got);
    return r;
  };

  // Setup (admin): a current far-future year with two classes in A, a past year
  // class (history), and a class in B.
  const must = (r, what) => {
    if (r.error) throw new Error(`studentActions setup: ${what} (${r.error.code})`);
    return r.data;
  };
  const year = async (schoolId, start, isCurrent) =>
    must(
      await admin
        .from("academic_years")
        .insert({
          school_id: schoolId,
          label: `${start}-${start + 1}`,
          start_date: `${start}-09-01`,
          end_date: `${start + 1}-06-30`,
          is_current: isCurrent,
        })
        .select("id")
        .single(),
      `year ${start}`,
    ).id;
  const level = async (schoolId) =>
    must(await admin.from("levels").insert({ school_id: schoolId, name: "P5A level", cycle: "college" }).select("id").single(), "level").id;
  const klass = async (schoolId, yearId, levelId, name) =>
    must(
      await admin
        .from("classes")
        .insert({ school_id: schoolId, academic_year_id: yearId, level_id: levelId, name })
        .select("id")
        .single(),
      `class ${name}`,
    ).id;

  const pastA = await year(A.id, 2067, false);
  const currentA = await year(A.id, 2068, true);
  const yearB = await year(B.id, 2068, true);
  const levelA = await level(A.id);
  const levelB = await level(B.id);
  const pastClass = await klass(A.id, pastA, levelA, "P5A-old");
  const class1 = await klass(A.id, currentA, levelA, "P5A-1");
  const class2 = await klass(A.id, currentA, levelA, "P5A-2");
  const classB = await klass(B.id, yearB, levelB, "P5A-1");

  const form = (extra = {}) => ({
    lastName: "Benali",
    firstName: "Amine",
    lastNameAr: "",
    firstNameAr: "",
    birthDate: "2014-03-02",
    gender: "male",
    codeMassar: "",
    classId: "",
    ...extra,
  });
  const studentRow = async (id) =>
    (await admin.from("students").select("*").eq("id", id).maybeSingle()).data;
  const classesOf = async (id) =>
    (await admin.from("student_enrollments").select("academic_year_id, class_id").eq("student_id", id)).data ?? [];

  // --- Create -----------------------------------------------------------------------
  await expect("surveillant cannot add a student", call("survA", "createStudent", form()), "forbidden");
  await expect("teacher cannot add a student", call("tchA", "createStudent", form()), "forbidden");
  const created = await expect("director adds a student, Massar code typed \" j13 0012345 \"",
    call("dirA", "createStudent", form({ codeMassar: " j13 0012345 ", lastNameAr: "بنعلي", firstNameAr: "أمين", classId: class1 })),
    "ok");
  const amine = created.ok ? created.data.id : null;
  const stored = await studentRow(amine);
  check("[P5 action] …Massar code stored trimmed and uppercased", stored?.code_massar === "J130012345", stored?.code_massar);
  const placed = await classesOf(amine);
  check("[P5 action] …in the chosen class of the current year",
    placed.length === 1 && placed[0].class_id === class1 && placed[0].academic_year_id === currentA, JSON.stringify(placed));

  await expect("the same Massar code again → massarTaken",
    call("dirA", "createStudent", form({ codeMassar: "J130012345" })), "massarTaken", "codeMassar");
  await expect("a bad Massar code → invalidMassar",
    call("dirA", "createStudent", form({ codeMassar: "J12" })), "invalidMassar", "codeMassar");
  await expect("only the Arabic last name → arabicNamesBoth",
    call("dirA", "createStudent", form({ lastNameAr: "بنعلي" })), "arabicNamesBoth", "firstNameAr");
  await expect("Arabic letters in the Latin name → latinOnly",
    call("dirA", "createStudent", form({ lastName: "بنعلي" })), "latinOnly", "lastName");
  await expect("a birth date in the future → birthDateRange",
    call("dirA", "createStudent", form({ birthDate: "2999-01-01" })), "birthDateRange", "birthDate");
  await expect("no gender → genderRequired", call("dirA", "createStudent", form({ gender: "" })), "genderRequired", "gender");
  await expect("a class of another school → invalidClass",
    call("dirA", "createStudent", form({ lastName: "Orphan", classId: classB })), "invalidClass", "classId");
  const orphans = (await admin.from("students").select("id").eq("school_id", A.id).eq("last_name", "Orphan")).data ?? [];
  check("[P5 action] …and no student is left without that class", orphans.length === 0, `${orphans.length} left`);
  await expect("a class of a past year → invalidClass",
    call("dirA", "createStudent", form({ lastName: "Old", classId: pastClass })), "invalidClass", "classId");

  // --- Update -----------------------------------------------------------------------
  await admin.from("student_enrollments").insert({ school_id: A.id, student_id: amine, academic_year_id: pastA, class_id: pastClass });
  await expect("director moves the student to another class",
    call("dirA", "updateStudent", amine, form({ codeMassar: "J130012345", classId: class2 })), "ok");
  const moved = await classesOf(amine);
  check("[P5 action] …this year's class changed, the past year's kept",
    moved.some((e) => e.academic_year_id === currentA && e.class_id === class2) &&
      moved.some((e) => e.academic_year_id === pastA && e.class_id === pastClass),
    JSON.stringify(moved));
  check("[P5 action] …Arabic names cleared when left empty", (await studentRow(amine))?.last_name_ar === null, "");
  await expect("director removes the class for this year",
    call("dirA", "updateStudent", amine, form({ codeMassar: "J130012345", classId: "" })), "ok");
  const unplaced = await classesOf(amine);
  check("[P5 action] …only the past year's class remains",
    unplaced.length === 1 && unplaced[0].academic_year_id === pastA, JSON.stringify(unplaced));
  await expect("surveillant cannot edit a student",
    call("survA", "updateStudent", amine, form()), "forbidden");
  await expect("director B cannot edit school A's student",
    call("dirB", "updateStudent", amine, form()), "notFound");

  // --- A class with students --------------------------------------------------------
  await call("dirA", "updateStudent", amine, form({ codeMassar: "J130012345", classId: class1 }));
  await expect("a class that has students cannot be deleted → classHasStudents",
    call("dirA", "deleteClass", class1), "classHasStudents");

  // --- Delete -----------------------------------------------------------------------
  await expect("surveillant cannot delete a student", call("survA", "deleteStudent", amine), "forbidden");
  await expect("director B cannot delete school A's student", call("dirB", "deleteStudent", amine), "notFound");
  await expect("director deletes the student", call("dirA", "deleteStudent", amine), "ok");
  check("[P5 action] …with their classes of every year", (await classesOf(amine)).length === 0, "");

  // Leave nothing for the next suites.
  await admin.from("students").delete().in("school_id", [A.id, B.id]);
  await admin.from("classes").delete().in("id", [pastClass, class1, class2, classB]);
  await admin.from("levels").delete().in("id", [levelA, levelB]);
  await admin.from("academic_years").delete().in("id", [pastA, currentA, yearB]);
}
