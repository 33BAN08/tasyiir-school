// Phase 4 step 1 Server Actions (academic years), called over HTTP as real
// users. All four are registered on /setup/years.
import { randomUUID } from "node:crypto";

import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";

const FILE = "src/lib/structure/year-actions.ts";

export async function yearActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const ids = Object.fromEntries(
    ["createAcademicYear", "updateAcademicYear", "setCurrentAcademicYear", "deleteAcademicYear"].map((n) => [
      n,
      actionId(FILE, n),
    ]),
  );
  const cookies = {};
  for (const name of ["dirA", "survA", "dirB"]) cookies[name] = await sessionCookies(fx.users[name]);

  const call = (who, action, ...args) =>
    callAction(baseUrl, { id: ids[action], path: "/fr/setup/years", args, cookies: cookies[who] });
  const expect = async (label, promise, wanted) => {
    const r = await promise;
    const got = r.ok ? "ok" : r.error;
    check(`[P4 action] ${label}`, got === wanted, got);
    return r;
  };
  const yearsOf = async (schoolId) =>
    (await admin.from("academic_years").select("id, label, is_current").eq("school_id", schoolId)).data ?? [];
  const form = (label, startDate, endDate) => ({ label, startDate, endDate });

  // The DB-level checks (phase4.mjs) leave one current year "2026-2027" in A and B.
  const yearA = (await yearsOf(A.id)).find((y) => y.is_current);
  const yearB = (await yearsOf(B.id)).find((y) => y.is_current);
  // The delete check uses a past year of its own: earlier suites (phase13-fee-reports.mjs)
  // leave classes and payments in A's current year, and a year with payments never goes.
  const { data: pastYear } = await admin.from("academic_years")
    .insert({ school_id: A.id, label: "2020-2021", start_date: "2020-09-01", end_date: "2021-06-30", is_current: false })
    .select("id").single();

  // --- Who may call ----------------------------------------------------------
  await expect("surveillant cannot create a year",
    call("survA", "createAcademicYear", form("2030-2031", "2030-09-01", "2031-06-30")), "forbidden");

  // --- Create ----------------------------------------------------------------
  const created = await expect("director creates next year",
    call("dirA", "createAcademicYear", form("2027-2028", "2027-09-01", "2028-06-30")), "ok");
  const next = created.ok ? created.data.id : null;
  check("[P4 action] a new year does not replace the current one",
    (await yearsOf(A.id)).find((y) => y.is_current)?.id === yearA?.id, "");
  await expect("duplicate label → labelTaken",
    call("dirA", "createAcademicYear", form("2027-2028", "2029-09-01", "2030-06-30")), "labelTaken");
  await expect("overlapping dates → yearOverlap",
    call("dirA", "createAcademicYear", form("Autre", "2028-01-01", "2028-07-31")), "yearOverlap");
  await expect("end before start → endBeforeStart",
    call("dirA", "createAcademicYear", form("2031-2032", "2031-09-01", "2031-06-30")), "endBeforeStart");
  await expect("longer than a year → yearTooLong",
    call("dirA", "createAcademicYear", form("2031-2032", "2031-09-01", "2032-09-01")), "yearTooLong");
  await expect("invalid date → invalidDate",
    call("dirA", "createAcademicYear", form("2031-2032", "01/09/2031", "2032-06-30")), "invalidDate");

  // --- Update / set current --------------------------------------------------
  await expect("director edits own year",
    call("dirA", "updateAcademicYear", next, form("2027-2028", "2027-09-02", "2028-06-29")), "ok");
  await expect("director A cannot edit school B's year",
    call("dirA", "updateAcademicYear", yearB?.id, form("x", "2040-09-01", "2041-06-30")), "notFound");
  await expect("director A cannot make school B's year current",
    call("dirA", "setCurrentAcademicYear", yearB?.id), "notFound");
  await expect("surveillant cannot change the current year",
    call("survA", "setCurrentAcademicYear", next), "forbidden");
  await expect("director makes next year current", call("dirA", "setCurrentAcademicYear", next), "ok");
  const after = await yearsOf(A.id);
  check("[P4 action] exactly one current year, the new one",
    after.filter((y) => y.is_current).length === 1 && after.find((y) => y.is_current)?.id === next, "");
  check("[P4 action] school B's current year unchanged",
    (await yearsOf(B.id)).find((y) => y.is_current)?.id === yearB?.id, "");

  // --- Delete ----------------------------------------------------------------
  await expect("the current year cannot be deleted", call("dirA", "deleteAcademicYear", next), "deleteCurrent");
  await expect("director B cannot delete school A's year", call("dirB", "deleteAcademicYear", yearA?.id), "notFound");
  await expect("not a uuid → notFound", call("dirA", "deleteAcademicYear", "x"), "notFound");
  await expect("director deletes a past, non-current year", call("dirA", "deleteAcademicYear", pastYear?.id), "ok");
  check("[P4 action] the deleted year is gone", !!pastYear && !(await yearsOf(A.id)).some((y) => y.id === pastYear.id), "");

  // A year with a payment (no class) is kept: payments_year_fkey → yearHasPayments.
  // Payments are written only by record_payment (the secret key cannot insert): pay through it
  // as the director, then remove the enrollment and the class so only the payment holds the year.
  const paid = await paidYearWithoutClasses(fx);
  check("[P4 action] setup: a payment in a past year without classes", !paid.error, paid.error ?? "");
  await expect("a year with payments → yearHasPayments", call("dirA", "deleteAcademicYear", paid.year), "yearHasPayments");
  check("[P4 action] …the year with payments is still there", !!paid.year && (await yearsOf(A.id)).some((y) => y.id === paid.year), "");
}

async function paidYearWithoutClasses(fx) {
  const A = fx.schools.a;
  const step = async (what, promise) => {
    const r = await promise;
    if (r.error) throw new Error(`${what}: ${r.error.message}`);
    return r.data;
  };
  let year = null;
  try {
    await step("fees module", admin.from("school_modules")
      .upsert({ school_id: A.id, module_key: "fees", enabled: true }, { onConflict: "school_id,module_key" }));
    year = (await step("year", admin.from("academic_years")
      .insert({ school_id: A.id, label: "2019-2020", start_date: "2019-09-01", end_date: "2020-06-30", is_current: false })
      .select("id").single())).id;
    const level = (await step("level", admin.from("levels")
      .insert({ school_id: A.id, cycle: "college", name: `PY ${fx.run}` }).select("id").single())).id;
    const cls = (await step("class", admin.from("classes")
      .insert({ school_id: A.id, academic_year_id: year, level_id: level, name: `PY ${fx.run}` }).select("id").single())).id;
    const student = (await step("student", admin.from("students")
      .insert({ school_id: A.id, first_name: "Paid", last_name: `Year ${fx.run}`, birth_date: "2010-01-01", gender: "female" })
      .select("id").single())).id;
    await step("enrollment", admin.from("student_enrollments")
      .insert({ school_id: A.id, student_id: student, academic_year_id: year, class_id: cls }));
    await step("fee year", admin.from("fee_years")
      .upsert({ school_id: A.id, academic_year_id: year, billing_months: ["2019-10-01"], due_day: 5 }));
    const dirA = await signIn(fx.users.dirA);
    await step("plan", dirA.rpc("save_fee_plans",
      { p_year: year, p_rows: [{ level_id: level, registration_centimes: 50000, monthly_centimes: 100000 }] }));
    const today = (await step("clock", dirA.rpc("school_clock").single())).local_date;
    await step("payment", dirA.rpc("record_payment", {
      p_student: student, p_year: year, p_amount: 50000, p_method: "cash", p_paid_on: today, p_idempotency_key: randomUUID(),
    }));
    await step("enrollment removed", admin.from("student_enrollments").delete().eq("student_id", student).eq("academic_year_id", year));
    await step("class removed", admin.from("classes").delete().eq("id", cls));
    return { year };
  } catch (error) {
    return { year, error: error.message };
  } finally {
    await admin.from("school_modules").delete().eq("school_id", A.id).eq("module_key", "fees");
  }
}
