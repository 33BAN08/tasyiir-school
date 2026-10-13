// Phase 4 step 3: classes (database level). Writes through RLS with the user's
// session: own school + structure.manage. Year and level of the class's
// school, filière of the class's level (composite foreign keys); a year,
// level or filière that has classes cannot be deleted.
import { allowed, check, denied, rows } from "./checks.mjs";

export async function phase4Classes({ fx, as }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const C = fx.schools.c;
  const { anon, dirA, survA, dirB, dirC, owner } = as;

  const one = async (query, what) => {
    const { data, error } = await query.select("id").single();
    if (error) throw new Error(`phase4Classes setup: ${what} (${error.code})`);
    return data.id;
  };
  const refusedWith = async (label, query, code) => {
    const { error } = await query;
    check(`[P4] ${label}`, error?.code === code, error ? error.code : "ACCEPTED!");
  };

  // Far-future years so they never overlap the other suites' years.
  const yearOf = (schoolId, label) => ({ school_id: schoolId, label, start_date: "2050-09-01", end_date: "2051-06-30" });
  const yearA = await one(dirA.from("academic_years").insert(yearOf(A.id, "2050-2051")), "year A");
  const yearB = await one(dirB.from("academic_years").insert(yearOf(B.id, "2050-2051")), "year B");
  const levelA = await one(dirA.from("levels").insert({ school_id: A.id, name: "C-TC", cycle: "lycee" }), "level A");
  const level2A = await one(dirA.from("levels").insert({ school_id: A.id, name: "C-1AC", cycle: "college" }), "level 2 A");
  const levelB = await one(dirB.from("levels").insert({ school_id: B.id, name: "C-TC", cycle: "lycee" }), "level B");
  const trackA = await one(dirA.from("tracks").insert({ school_id: A.id, level_id: levelA, name: "Sciences" }), "track A");

  const cls = (schoolId, yearId, levelId, name, trackId = null) => ({
    school_id: schoolId,
    academic_year_id: yearId,
    level_id: levelId,
    track_id: trackId,
    name,
  });
  const insertClass = (client, values) => client.from("classes").insert(values).select("id");

  // --- Create -------------------------------------------------------------------
  const { data: classA } = await dirA
    .from("classes")
    .insert(cls(A.id, yearA, levelA, "TC-A", trackA))
    .select("id")
    .single();
  check("[P4] director creates a class with a filière", Boolean(classA));
  await allowed("[P4] director creates a class without filière", insertClass(dirA, cls(A.id, yearA, level2A, "1AC-A")));
  await allowed("[P4] another school can use the same class name", insertClass(dirB, cls(B.id, yearB, levelB, "TC-A")));

  await denied("[P4] director A cannot create a class in school B", insertClass(dirA, cls(B.id, yearB, levelB, "X")));
  await denied("[P4] surveillant cannot create a class", insertClass(survA, cls(A.id, yearA, levelA, "TC-B")));
  await denied("[P4] suspended school's director cannot create a class", insertClass(dirC, cls(C.id, yearA, levelA, "X")));
  await denied("[P4] platform owner cannot write classes", insertClass(owner, cls(A.id, yearA, levelA, "TC-B")));
  await denied("[P4] anonymous cannot create a class", insertClass(anon, cls(A.id, yearA, levelA, "TC-B")));

  await refusedWith("class in another school's year is refused (same-school foreign key)",
    insertClass(dirA, cls(A.id, yearB, levelA, "TC-B")), "23503");
  await refusedWith("class on another school's level is refused (same-school foreign key)",
    insertClass(dirA, cls(A.id, yearA, levelB, "TC-B")), "23503");
  await refusedWith("filière of another level is refused",
    insertClass(dirA, cls(A.id, yearA, level2A, "1AC-B", trackA)), "23503");
  await refusedWith("class names are unique per year, ignoring case",
    insertClass(dirA, cls(A.id, yearA, level2A, "tc-a")), "23505");
  await refusedWith("name with outer spaces is refused", insertClass(dirA, cls(A.id, yearA, levelA, " TC-B")), "23514");

  // --- Read ---------------------------------------------------------------------
  await rows("[P4] surveillant reads own school's classes", survA.from("classes").select("id"), 2);
  await rows("[P4] director B sees no class of school A", dirB.from("classes").select("id").eq("school_id", A.id), 0);
  await rows("[P4] platform owner reads school A's classes",
    owner.from("classes").select("id").eq("school_id", A.id), 2);

  // --- Update -------------------------------------------------------------------
  await allowed("[P4] director renames own class",
    dirA.from("classes").update({ name: "TC-Sc" }).eq("id", classA?.id).select("id"));
  await denied("[P4] director cannot move a class to another school",
    dirA.from("classes").update({ school_id: B.id }).eq("id", classA?.id).select("id"));
  await denied("[P4] director B cannot rename school A's class",
    dirB.from("classes").update({ name: "x" }).eq("id", classA?.id).select("id"));
  await denied("[P4] surveillant cannot rename a class",
    survA.from("classes").update({ name: "x" }).eq("id", classA?.id).select("id"));
  await refusedWith("a class cannot move to another school's year",
    dirA.from("classes").update({ academic_year_id: yearB }).eq("id", classA?.id).select("id"), "23503");
  await refusedWith("a class cannot keep a filière of its old level",
    dirA.from("classes").update({ level_id: level2A }).eq("id", classA?.id).select("id"), "23503");

  // --- Delete -------------------------------------------------------------------
  await refusedWith("a year with classes cannot be deleted",
    dirA.from("academic_years").delete().eq("id", yearA), "23503");
  await refusedWith("a level with classes cannot be deleted", dirA.from("levels").delete().eq("id", level2A), "23503");
  await refusedWith("a filière with classes cannot be deleted", dirA.from("tracks").delete().eq("id", trackA), "23503");
  await denied("[P4] director B cannot delete school A's class",
    dirB.from("classes").delete().eq("id", classA?.id).select("id"));
  await denied("[P4] surveillant cannot delete a class", survA.from("classes").delete().eq("id", classA?.id).select("id"));
  await allowed("[P4] director deletes own classes", dirA.from("classes").delete().eq("school_id", A.id).select("id"));
  await allowed("[P4] …then the empty filière can be deleted",
    dirA.from("tracks").delete().eq("id", trackA).select("id"));

  // Leave nothing for the next suites.
  await dirB.from("classes").delete().eq("school_id", B.id);
  await dirA.from("levels").delete().in("id", [levelA, level2A]);
  await dirB.from("levels").delete().eq("id", levelB);
  await dirA.from("academic_years").delete().eq("id", yearA);
  await dirB.from("academic_years").delete().eq("id", yearB);
}
