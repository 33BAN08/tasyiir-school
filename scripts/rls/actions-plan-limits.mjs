// Launch prep step 2a, Server Actions + pages: a school at its plan limit gets a
// clear error key (not "generic"), nothing is created, the import preview says how
// many places are left and the import is refused, the pages say so. School A is
// squeezed to exactly what it uses (override), then put back to 5000 / 100.
import { actionId, callAction, callActionWithForm, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin } from "./fixtures.mjs";
import { cleanup, setupSchool } from "./actions-import.mjs";

const FR_HEADERS = ["Nom (latin)", "Prénom (latin)", "Date de naissance (jj/mm/aaaa)", "Sexe (G/F)", "Classe"];

export async function planLimitActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const label = (s) => `[Limits action] ${s}`;
  const cookies = await sessionCookies(fx.users.dirA);
  const s = await setupSchool(A);

  const sub = (await admin.from("school_subscriptions").select("id").eq("school_id", A.id).neq("status", "expired").single()).data.id;
  const students = async () =>
    (await admin.from("students").select("id", { count: "exact", head: true }).eq("school_id", A.id)).count;
  const admins = async () =>
    (
      await admin
        .from("profiles")
        .select("id, role:roles!inner(key)")
        .eq("school_id", A.id)
        .is("deactivated_at", null)
        .not("role.key", "in", "(teacher,parent,student,driver)")
    ).data.length;

  const page = async (path) => {
    const res = await fetch(new URL(path, baseUrl), { headers: { cookie: cookies }, redirect: "manual" });
    return { status: res.status, html: res.status === 200 ? await res.text() : "" };
  };
  const csv = (lines) => new File([[FR_HEADERS.join(";"), ...lines].join("\r\n")], "eleves.csv", { type: "text/csv" });
  const importCall = (action, file) =>
    callActionWithForm(baseUrl, {
      id: actionId("src/lib/students/import/import-actions.ts", action),
      path: "/fr/students/import",
      fields: { file },
      cookies,
    });

  try {
    // Room for exactly 2 more students, and no more admin accounts.
    const have = await students();
    await admin.from("school_subscriptions").update({ max_students_override: have + 2, max_admins_override: await admins() }).eq("id", sub);

    // --- Import: preview says how many places are left; the import is refused beyond that ---------------
    const three = csv([
      "Imp-Lim;Un;02/03/2014;G;IMP-1A",
      "Imp-Lim;Deux;02/03/2014;F;IMP-1A",
      "Imp-Lim;Trois;02/03/2014;G;IMP-1A",
    ]);
    const preview = await importCall("previewImport", three);
    check(label("the import preview reports the places left (2)"), preview.ok && preview.data.placesLeft === 2, JSON.stringify(preview.data?.placesLeft));
    const refused = await importCall("commitImport", three);
    check(label("importing 3 students into 2 places is refused with planStudentLimit"), !refused.ok && refused.error === "planStudentLimit", refused.error ?? "IMPORTED!");
    check(label("... and nothing was imported (all or nothing)"), (await students()) === have, `${await students()} vs ${have}`);
    const two = csv(["Imp-Lim;Un;02/03/2014;G;IMP-1A", "Imp-Lim;Deux;02/03/2014;F;IMP-1A"]);
    const fits = await importCall("commitImport", two);
    check(label("importing 2 students into 2 places works"), fits.ok && fits.data.created === 2, fits.error ?? "");

    // --- The student form --------------------------------------------------------------------------------
    const form = {
      lastName: "LimitForm", firstName: "Amine", lastNameAr: "", firstNameAr: "", birthDate: "2014-03-02",
      gender: "male", codeMassar: "", classId: "",
    };
    const createStudent = (input) =>
      callAction(baseUrl, { id: actionId("src/lib/students/student-actions.ts", "createStudent"), path: "/fr/students", args: [input], cookies });
    const full = await createStudent(form);
    check(label("createStudent at the limit: planStudentLimit"), !full.ok && full.error === "planStudentLimit", full.error ?? "CREATED!");
    check(label("... and no student was created"), (await students()) === have + 2);

    // --- Staff accounts -----------------------------------------------------------------------------------
    const createStaff = (input) =>
      callAction(baseUrl, { id: actionId("src/lib/staff/actions.ts", "createStaff"), path: "/fr/staff", args: [input], cookies });
    const person = (n, roleId) => ({
      fullName: `RLS limit staff ${n}`, email: `rls-test+${fx.run}-limstaff${n}@example.com`, roleId, phone: "", locale: "fr",
    });
    const blocked = person(1, A.roles.surveillant);
    const adminResult = await createStaff(blocked);
    check(label("createStaff (surveillant) at the admin limit: planAdminLimit"), !adminResult.ok && adminResult.error === "planAdminLimit", adminResult.error ?? "CREATED!");
    const left = (await admin.from("profiles").select("id").eq("email", blocked.email)).data ?? [];
    check(label("... and no half-created account is left"), left.length === 0);
    const teacherResult = await createStaff(person(2, A.roles.teacher));
    check(label("createStaff (teacher) at the admin limit still works"), teacherResult.ok === true, teacherResult.error ?? "");

    // --- Pages --------------------------------------------------------------------------------------------
    const studentsPage = await page("/fr/students");
    check(label("/students says the student places are used up and hides the add buttons"),
      studentsPage.status === 200 && studentsPage.html.includes('data-plan-full="students"') && !studentsPage.html.includes("/students/import"),
      `${studentsPage.status}`);
    const staffPage = await page("/fr/staff");
    check(label("/staff says the admin accounts are used up"), staffPage.status === 200 && staffPage.html.includes('data-plan-full="admins"'), `${staffPage.status}`);
    const settings = await page("/fr/settings/school");
    check(label("/settings/school shows the plan usage card"), settings.status === 200 && settings.html.includes("data-plan-usage"), `${settings.status}`);
  } finally {
    await admin.from("school_subscriptions").update({ max_students_override: 5000, max_admins_override: 100 }).eq("id", sub);
    await cleanup(A, s);
  }
}
