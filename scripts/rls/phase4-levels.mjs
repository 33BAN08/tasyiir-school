// Phase 4 step 2: levels and filières (database level). Writes through RLS
// with the user's session: own school + structure.manage; a filière always
// stays in its level's school (composite foreign key).
import { allowed, check, denied, rows } from "./checks.mjs";

export async function phase4Levels({ fx, as }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const C = fx.schools.c;
  const { anon, dirA, survA, dirB, dirC, owner } = as;

  const level = (schoolId, name, cycle = "college", extra = {}) => ({ school_id: schoolId, name, cycle, ...extra });
  const insertLevel = (client, values) => client.from("levels").insert(values).select("id");
  const refusedWith = async (label, query, code) => {
    const { error } = await query;
    check(`[P4] ${label}`, error?.code === code, error ? error.code : "ACCEPTED!");
  };

  // --- Levels ----------------------------------------------------------------
  const { data: levelA } = await dirA.from("levels").insert(level(A.id, "1AC")).select("id").single();
  check("[P4] director creates a level in own school", Boolean(levelA));
  const { data: levelB } = await dirB.from("levels").insert(level(B.id, "1AC")).select("id").single();
  check("[P4] another school can use the same level name", Boolean(levelB));

  await denied("[P4] director A cannot create a level in school B", insertLevel(dirA, level(B.id, "2AC")));
  await denied("[P4] surveillant cannot create a level", insertLevel(survA, level(A.id, "2AC")));
  await denied("[P4] suspended school's director cannot create a level", insertLevel(dirC, level(C.id, "2AC")));
  await denied("[P4] platform owner cannot write levels", insertLevel(owner, level(A.id, "2AC")));
  await denied("[P4] anonymous cannot create a level", insertLevel(anon, level(A.id, "2AC")));

  await refusedWith("level names are unique per school, ignoring case", insertLevel(dirA, level(A.id, "1ac")), "23505");
  await refusedWith("unknown cycle is refused", insertLevel(dirA, level(A.id, "X1", "university")), "23514");
  await refusedWith("name with outer spaces is refused", insertLevel(dirA, level(A.id, " 2AC ")), "23514");

  await rows("[P4] surveillant reads own school's levels", survA.from("levels").select("id"), 1);
  await rows("[P4] director B sees no level of school A", dirB.from("levels").select("id").eq("school_id", A.id), 0);
  await rows("[P4] platform owner reads school A's levels", owner.from("levels").select("id").eq("school_id", A.id), 1);

  await allowed("[P4] director renames own level",
    dirA.from("levels").update({ name: "1APIC" }).eq("id", levelA?.id).select("id"));
  await denied("[P4] director cannot move a level to another school",
    dirA.from("levels").update({ school_id: B.id }).eq("id", levelA?.id).select("id"));
  await denied("[P4] director B cannot rename school A's level",
    dirB.from("levels").update({ name: "x" }).eq("id", levelA?.id).select("id"));
  await denied("[P4] surveillant cannot rename a level",
    survA.from("levels").update({ name: "x" }).eq("id", levelA?.id).select("id"));

  // --- Filières ----------------------------------------------------------------
  const track = (schoolId, levelId, name) => ({ school_id: schoolId, level_id: levelId, name });
  const { data: trackA } = await dirA
    .from("tracks")
    .insert(track(A.id, levelA?.id, "Sciences"))
    .select("id")
    .single();
  check("[P4] director adds a filière to own level", Boolean(trackA));
  await refusedWith("filière on another school's level is refused (same-school foreign key)",
    dirA.from("tracks").insert(track(A.id, levelB?.id, "Spy")).select("id"), "23503");
  await denied("[P4] director B cannot add a filière in school A",
    dirB.from("tracks").insert(track(A.id, levelA?.id, "Spy")).select("id"));
  await refusedWith("director B cannot hang a school-B filière on school A's level",
    dirB.from("tracks").insert(track(B.id, levelA?.id, "Spy")).select("id"), "23503");
  await denied("[P4] surveillant cannot add a filière",
    survA.from("tracks").insert(track(A.id, levelA?.id, "Lettres")).select("id"));
  await refusedWith("filière names are unique per level, ignoring case",
    dirA.from("tracks").insert(track(A.id, levelA?.id, "SCIENCES")).select("id"), "23505");
  await refusedWith("a filière cannot be moved to another school's level",
    dirA.from("tracks").update({ level_id: levelB?.id }).eq("id", trackA?.id).select("id"), "23503");

  await rows("[P4] surveillant reads own school's filières", survA.from("tracks").select("id"), 1);
  await rows("[P4] director B sees no filière of school A", dirB.from("tracks").select("id").eq("school_id", A.id), 0);
  await denied("[P4] director B cannot delete school A's filière",
    dirB.from("tracks").delete().eq("id", trackA?.id).select("id"));

  // Deleting a level deletes its filières.
  await allowed("[P4] director deletes own level", dirA.from("levels").delete().eq("id", levelA?.id).select("id"));
  await rows("[P4] its filières are gone too", dirA.from("tracks").select("id").eq("level_id", levelA?.id), 0);
}
