// Phase 4: school structure (database level). School data is written with the
// user's own session through RLS: own school + structure.manage.
import { allowed, check, denied, rows } from "./checks.mjs";

export async function phase4({ fx, as }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const C = fx.schools.c;
  const { anon, dirA, survA, deactA, dirB, dirC, owner } = as;

  // --- Academic years --------------------------------------------------------
  const year = (schoolId, label, start, end, extra = {}) => ({
    school_id: schoolId,
    label,
    start_date: start,
    end_date: end,
    ...extra,
  });
  const insertYear = (client, values) => client.from("academic_years").insert(values).select("id, is_current");

  const { data: y1 } = await dirA
    .from("academic_years")
    .insert(year(A.id, "2026-2027", "2026-09-01", "2027-06-30", { is_current: true }))
    .select("id")
    .single();
  check("[P4] director creates an academic year in own school", Boolean(y1));
  await allowed("[P4] director B creates a year in school B",
    insertYear(dirB, year(B.id, "2026-2027", "2026-09-01", "2027-06-30", { is_current: true })));

  await denied("[P4] director A cannot create a year in school B",
    insertYear(dirA, year(B.id, "2030-2031", "2030-09-01", "2031-06-30")));
  await denied("[P4] surveillant (no structure.manage) cannot create a year",
    insertYear(survA, year(A.id, "2030-2031", "2030-09-01", "2031-06-30")));
  await denied("[P4] director of a suspended school cannot create a year",
    insertYear(dirC, year(C.id, "2026-2027", "2026-09-01", "2027-06-30")));
  await denied("[P4] deactivated user (old JWT) cannot create a year",
    insertYear(deactA, year(A.id, "2030-2031", "2030-09-01", "2031-06-30")));
  await denied("[P4] platform owner cannot write school years",
    insertYear(owner, year(A.id, "2030-2031", "2030-09-01", "2031-06-30")));
  await denied("[P4] anonymous cannot create a year",
    insertYear(anon, year(A.id, "2030-2031", "2030-09-01", "2031-06-30")));

  // Reads: members of the school (any role), platform owner; nobody else.
  await rows("[P4] surveillant reads own school's years", survA.from("academic_years").select("id"), 1);
  await rows("[P4] director B sees no year of school A",
    dirB.from("academic_years").select("id").eq("school_id", A.id), 0);
  await rows("[P4] platform owner reads school A's years",
    owner.from("academic_years").select("id").eq("school_id", A.id), 1);
  // anon has no grant at all: refused outright, not just filtered.
  await denied("[P4] anonymous cannot read years", anon.from("academic_years").select("id"));

  // Database rules.
  const refusedWith = async (label, query, code) => {
    const { error } = await query;
    check(`[P4] ${label}`, error?.code === code, error ? error.code : "ACCEPTED!");
  };
  await refusedWith("same label twice in a school is refused",
    insertYear(dirA, year(A.id, "2026-2027", "2031-09-01", "2032-06-30")), "23505");
  await refusedWith("overlapping years are refused",
    insertYear(dirA, year(A.id, "Bis", "2027-01-01", "2027-07-15")), "23P01");
  await refusedWith("a year longer than one year is refused",
    insertYear(dirA, year(A.id, "Long", "2028-09-01", "2029-09-01")), "23514");
  await refusedWith("a year ending before it starts is refused",
    insertYear(dirA, year(A.id, "Back", "2028-09-01", "2028-06-30")), "23514");

  // One current year: making a new one current un-sets the old one.
  const { data: y2 } = await dirA
    .from("academic_years")
    .insert(year(A.id, "2027-2028", "2027-09-01", "2028-06-30", { is_current: true }))
    .select("id")
    .single();
  await rows("[P4] a new current year replaces the previous one (one current per school)",
    dirA.from("academic_years").select("id").eq("school_id", A.id).eq("is_current", true),
    (r) => r.length === 1 && r[0].id === y2?.id);
  await rows("[P4] school B's current year is untouched",
    dirB.from("academic_years").select("id").eq("school_id", B.id).eq("is_current", true), 1);
  await allowed("[P4] director switches the current year back",
    dirA.from("academic_years").update({ is_current: true }).eq("id", y1?.id).select("id"));
  await rows("[P4] still exactly one current year",
    dirA.from("academic_years").select("id").eq("school_id", A.id).eq("is_current", true),
    (r) => r.length === 1 && r[0].id === y1?.id);

  // Updates and deletes.
  await allowed("[P4] director renames own year",
    dirA.from("academic_years").update({ label: "2027/2028" }).eq("id", y2?.id).select("id"));
  await denied("[P4] director cannot move a year to another school",
    dirA.from("academic_years").update({ school_id: B.id }).eq("id", y2?.id).select("id"));
  await denied("[P4] surveillant cannot rename a year",
    survA.from("academic_years").update({ label: "x" }).eq("id", y2?.id).select("id"));
  await denied("[P4] director B cannot rename school A's year",
    dirB.from("academic_years").update({ label: "x" }).eq("id", y2?.id).select("id"));
  await denied("[P4] director B cannot delete school A's year",
    dirB.from("academic_years").delete().eq("id", y2?.id).select("id"));
  await denied("[P4] surveillant cannot delete a year",
    survA.from("academic_years").delete().eq("id", y2?.id).select("id"));
  await allowed("[P4] director deletes own year", dirA.from("academic_years").delete().eq("id", y2?.id).select("id"));
}
