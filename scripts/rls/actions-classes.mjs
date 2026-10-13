// Phase 4 step 3 Server Actions (classes), called over HTTP as real users.
// Each is called on the page that registers it. Also checks the clear messages of the
// year / level / filière deletes once classes use them.
import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin } from "./fixtures.mjs";

// file → [page that registers its actions, action names]
const ACTIONS = {
  "src/lib/structure/class-actions.ts": ["/fr/setup/classes", ["createClass", "createClasses", "updateClass", "deleteClass"]],
  "src/lib/structure/year-actions.ts": ["/fr/setup/years", ["deleteAcademicYear"]],
  "src/lib/structure/level-actions.ts": ["/fr/setup/levels", ["deleteLevel"]],
  "src/lib/structure/track-actions.ts": ["/fr/setup/levels", ["deleteTrack"]],
};

export async function classActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const ids = Object.fromEntries(
    Object.entries(ACTIONS).flatMap(([file, [path, names]]) => names.map((n) => [n, { id: actionId(file, n), path }])),
  );
  const cookies = {};
  for (const name of ["dirA", "survA", "dirB"]) cookies[name] = await sessionCookies(fx.users[name]);

  const call = (who, action, ...args) =>
    callAction(baseUrl, { ...ids[action], args, cookies: cookies[who] });
  const expect = async (label, promise, wanted) => {
    const r = await promise;
    const got = r.ok ? "ok" : r.error;
    check(`[P4 action] ${label}`, got === wanted, got);
    return r;
  };
  const setup = async (table, values) => {
    const { data, error } = await admin.from(table).insert(values).select("id").single();
    if (error) throw new Error(`classActions setup: ${table} (${error.code})`);
    return data.id;
  };
  const namesOf = async (yearId) =>
    ((await admin.from("classes").select("name").eq("academic_year_id", yearId)).data ?? []).map((c) => c.name).sort();

  // Fixtures (test setup only, with the secret key); far-future dates, no overlap.
  const year = (schoolId) => ({ school_id: schoolId, label: "2052-2053", start_date: "2052-09-01", end_date: "2053-06-30" });
  const yearA = await setup("academic_years", year(A.id));
  const yearB = await setup("academic_years", year(B.id));
  const tc = await setup("levels", { school_id: A.id, name: "K-TC", cycle: "lycee" });
  const ac1 = await setup("levels", { school_id: A.id, name: "K-1AC", cycle: "college" });
  const levelB = await setup("levels", { school_id: B.id, name: "K-1AC", cycle: "college" });
  const sciences = await setup("tracks", { school_id: A.id, level_id: tc, name: "Sciences" });

  // --- createClass ----------------------------------------------------------------
  const one = await expect("director creates a class with a filière",
    call("dirA", "createClass", yearA, { levelId: tc, trackId: sciences, name: "K-TC-A" }), "ok");
  const classId = one.ok ? one.data.id : null;
  await expect("same name in the year (any case) → classNameTaken",
    call("dirA", "createClass", yearA, { levelId: ac1, trackId: "", name: "k-tc-a" }), "classNameTaken");
  await expect("filière of another level → invalidTrack",
    call("dirA", "createClass", yearA, { levelId: ac1, trackId: sciences, name: "K-1AC-Z" }), "invalidTrack");
  await expect("no level → levelRequired",
    call("dirA", "createClass", yearA, { levelId: "", trackId: "", name: "X" }), "levelRequired");
  await expect("empty name → nameRequired",
    call("dirA", "createClass", yearA, { levelId: ac1, trackId: "", name: "  " }), "nameRequired");
  await expect("school B's year → notFound",
    call("dirA", "createClass", yearB, { levelId: ac1, trackId: "", name: "X" }), "notFound");
  await expect("school B's level → notFound",
    call("dirA", "createClass", yearA, { levelId: levelB, trackId: "", name: "X" }), "notFound");
  await expect("surveillant cannot create a class",
    call("survA", "createClass", yearA, { levelId: ac1, trackId: "", name: "X" }), "forbidden");

  // --- createClasses ----------------------------------------------------------------
  await admin.from("classes").insert({ school_id: A.id, academic_year_id: yearA, level_id: ac1, name: "K-1AC-B" });
  const many = await expect("director creates 3 classes at once",
    call("dirA", "createClasses", yearA, { levelId: ac1, trackId: "", prefix: "K-1AC", count: "3" }), "ok");
  check("[P4 action] …named with the next free letters (B is skipped)",
    many.ok && many.data.names.join(",") === "K-1AC-A,K-1AC-C,K-1AC-D", JSON.stringify(many.data ?? {}));
  await expect("13 classes → countRange",
    call("dirA", "createClasses", yearA, { levelId: ac1, trackId: "", prefix: "K-1AC", count: 13 }), "countRange");
  await admin.from("classes").insert(
    "EFGHIJKLMNOPQRSTUVW".split("").map((l) => ({ school_id: A.id, academic_year_id: yearA, level_id: ac1, name: `K-1AC-${l}` })),
  );
  await expect("not enough letters left → tooManyClasses (nothing created)",
    call("dirA", "createClasses", yearA, { levelId: ac1, trackId: "", prefix: "K-1AC", count: 4 }), "tooManyClasses");
  check("[P4 action] …all or nothing: X, Y, Z were not created",
    !(await namesOf(yearA)).includes("K-1AC-X"), "");
  await expect("director A cannot batch-create in school B's year",
    call("dirA", "createClasses", yearB, { levelId: ac1, trackId: "", prefix: "K", count: 2 }), "notFound");
  await expect("surveillant cannot batch-create",
    call("survA", "createClasses", yearA, { levelId: ac1, trackId: "", prefix: "K", count: 2 }), "forbidden");

  // --- updateClass ------------------------------------------------------------------
  await expect("director renames a class and drops its filière",
    call("dirA", "updateClass", classId, { levelId: tc, trackId: "", name: "K-TC-Sc" }), "ok");
  await expect("renaming to a taken name → classNameTaken",
    call("dirA", "updateClass", classId, { levelId: tc, trackId: "", name: "K-1AC-A" }), "classNameTaken");
  await expect("director B cannot edit school A's class",
    call("dirB", "updateClass", classId, { levelId: levelB, trackId: "", name: "x" }), "notFound");

  // --- Blocked deletes (clear messages) ----------------------------------------------
  await admin.from("classes").update({ track_id: sciences }).eq("id", classId);
  await expect("deleting a filière used by a class → trackHasClasses",
    call("dirA", "deleteTrack", sciences), "trackHasClasses");
  await expect("deleting a level with classes → levelHasClasses", call("dirA", "deleteLevel", ac1), "levelHasClasses");
  await expect("deleting a level whose filière has classes → levelHasClasses",
    call("dirA", "deleteLevel", tc), "levelHasClasses");
  await expect("deleting a year with classes → yearHasClasses",
    call("dirA", "deleteAcademicYear", yearA), "yearHasClasses");

  // --- deleteClass ------------------------------------------------------------------
  await expect("director B cannot delete school A's class", call("dirB", "deleteClass", classId), "notFound");
  await expect("surveillant cannot delete a class", call("survA", "deleteClass", classId), "forbidden");
  await expect("director deletes a class", call("dirA", "deleteClass", classId), "ok");
  await expect("…then its filière can be deleted", call("dirA", "deleteTrack", sciences), "ok");

  // Leave nothing for the next suites.
  await admin.from("classes").delete().eq("academic_year_id", yearA);
  await admin.from("levels").delete().in("id", [tc, ac1, levelB]);
  await admin.from("academic_years").delete().in("id", [yearA, yearB]);
}
