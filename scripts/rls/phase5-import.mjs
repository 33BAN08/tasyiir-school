// Phase 5 step 5: public.import_students() at the database level — who may
// call it, the 2000-row limit, and ALL OR NOTHING (one bad row = nothing saved).
import { randomUUID } from "node:crypto";

import { cleanup, setupSchool } from "./actions-import.mjs";
import { check } from "./checks.mjs";
import { admin } from "./fixtures.mjs";
import { randomMobile } from "./phase5-guardians.mjs";

export async function phase5Import({ fx, as }) {
  const A = fx.schools.a;
  const { anon, dirA, survA, dirB } = as;
  const s = await setupSchool(A);

  const row = (extra = {}) => ({
    id: randomUUID(),
    last_name: "Imp-Db",
    first_name: "Kid",
    last_name_ar: null,
    first_name_ar: null,
    birth_date: "2014-01-01",
    gender: "female",
    code_massar: null,
    class_id: s.classId,
    guardian_last_name: null,
    guardian_first_name: null,
    guardian_phone: null,
    guardian_relation: null,
    ...extra,
  });
  // All or nothing: checking the first 100 ids is enough (and keeps the request URL short).
  const saved = async (ids) =>
    (await admin.from("students").select("id", { count: "exact", head: true }).in("id", ids.slice(0, 100))).count;
  const refused = async (label, client, rows, code) => {
    const { error } = await client.rpc("import_students", { p_rows: rows });
    check(`[P5 import db] ${label}`, code ? error?.code === code : Boolean(error), error ? error.code : "ACCEPTED!");
    check(`[P5 import db] …nothing saved`, (await saved(rows.map((r) => r.id).filter(Boolean))) === 0, "");
  };

  try {
    await refused("anonymous cannot import", anon, [row()]);
    await refused("surveillant cannot import (no students.manage)", survA, [row()], "42501");
    await refused("director B cannot import into a class of school A", dirB, [row()]);
    await refused("more than 2000 rows refused", dirA, Array.from({ length: 2001 }, () => row()), "22023");
    await refused("an empty list is refused", dirA, [], "22023");
    await refused("a bad 2nd row rolls back the 1st (all or nothing)", dirA, [row(), row({ gender: "x" })], "23514");
    const phone = randomMobile();
    await refused("a bad link rolls back students and the new parent", dirA,
      [row({ guardian_last_name: "Imp-P", guardian_first_name: "Q", guardian_phone: phone, guardian_relation: "uncle" })], "23514");
    const { count: parents } = await admin.from("guardians").select("id", { count: "exact", head: true }).eq("phone", phone);
    check("[P5 import db] …and no parent left behind", parents === 0, `${parents}`);

    const ok = [row({ guardian_last_name: "Imp-P", guardian_first_name: "Q", guardian_phone: phone, guardian_relation: "mother" }),
      row({ guardian_last_name: "Imp-P", guardian_first_name: "Q", guardian_phone: phone, guardian_relation: "mother" })];
    const { data, error } = await dirA.rpc("import_students", { p_rows: ok });
    check("[P5 import db] director imports 2 siblings", !error && data === 2, error?.code ?? String(data));
    const { data: rows } = await admin.from("students").select("school_id, enrollment:student_enrollments(academic_year_id)").in("id", ok.map((r) => r.id));
    check("[P5 import db] …in the director's school and the current year",
      rows?.length === 2 && rows.every((r) => r.school_id === A.id && r.enrollment[0]?.academic_year_id === s.yearId), JSON.stringify(rows));
    const { count: one } = await admin.from("guardians").select("id", { count: "exact", head: true }).eq("phone", phone);
    check("[P5 import db] …one parent for both", one === 1, `${one}`);
  } finally {
    await admin.from("student_guardians").delete().eq("school_id", A.id);
    await cleanup(A, s);
  }
}
