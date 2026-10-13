// Phase 4 step 1 Server Actions (academic years), called over HTTP as real
// users. All four are registered on /setup/years.
import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin } from "./fixtures.mjs";

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
  await expect("director deletes a past, non-current year", call("dirA", "deleteAcademicYear", yearA?.id), "ok");
  check("[P4 action] the deleted year is gone", !(await yearsOf(A.id)).some((y) => y.id === yearA?.id), "");
}
