// Phase 4 step 2 Server Actions (levels, filières, Moroccan template), called
// over HTTP as real users. All are registered on /setup/levels.
import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin } from "./fixtures.mjs";

const ACTIONS = {
  "src/lib/structure/level-actions.ts": ["createLevel", "updateLevel", "moveLevel", "deleteLevel"],
  "src/lib/structure/track-actions.ts": ["createTrack", "renameTrack", "deleteTrack"],
  "src/lib/structure/template-actions.ts": ["applyLevelTemplate"],
};

export async function levelActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const ids = Object.fromEntries(
    Object.entries(ACTIONS).flatMap(([file, names]) => names.map((n) => [n, actionId(file, n)])),
  );
  const cookies = {};
  for (const name of ["dirA", "survA", "dirB"]) cookies[name] = await sessionCookies(fx.users[name]);

  const call = (who, action, ...args) =>
    callAction(baseUrl, { id: ids[action], path: "/fr/setup/levels", args, cookies: cookies[who] });
  const expect = async (label, promise, wanted) => {
    const r = await promise;
    const got = r.ok ? "ok" : r.error;
    check(`[P4 action] ${label}`, got === wanted, got);
    return r;
  };
  const levelsOf = async (schoolId) =>
    (await admin.from("levels").select("id, name, cycle, sort_order, tracks(id, name)").eq("school_id", schoolId))
      .data ?? [];

  // --- Template ----------------------------------------------------------------
  await expect("surveillant cannot apply the template",
    call("survA", "applyLevelTemplate", { levels: ["1AC"], tracks: [] }, "fr"), "forbidden");
  await expect("unknown UI language is refused",
    call("dirA", "applyLevelTemplate", { levels: ["1AC"], tracks: [] }, "de"), "generic");

  const picked = { levels: ["1AC", "2AC", "3AC", "TC", "1Bac"], tracks: ["tcSciences", "tcLettres", "bac1Sex"] };
  const applied = await expect("director applies part of the template", call("dirA", "applyLevelTemplate", picked, "fr"), "ok");
  check("[P4 action] template created 5 levels and 3 filières",
    applied.ok && applied.data.levels === 5 && applied.data.tracks === 3, JSON.stringify(applied.data ?? {}));
  const afterTemplate = await levelsOf(A.id);
  const tc = afterTemplate.find((l) => l.name === "TC");
  check("[P4 action] levels get their cycle and order (1AC=college, TC=lycee)",
    afterTemplate.find((l) => l.name === "1AC")?.cycle === "college" && tc?.cycle === "lycee", "");
  check("[P4 action] filières are named in the UI language (fr)",
    tc?.tracks.map((t) => t.name).sort().join("|") === "Lettres et sciences humaines|Sciences", "");
  check("[P4 action] unticked levels are not created", !afterTemplate.some((l) => l.name === "2Bac"), "");

  const again = await expect("applying the template twice", call("dirA", "applyLevelTemplate", picked, "fr"), "ok");
  check("[P4 action] …creates nothing the second time",
    again.ok && again.data.levels === 0 && again.data.tracks === 0, JSON.stringify(again.data ?? {}));
  await expect("adding a filière to an existing level through the template",
    call("dirA", "applyLevelTemplate", { levels: [], tracks: ["tcTechno"] }, "fr"), "ok");
  check("[P4 action] …adds only that filière",
    (await levelsOf(A.id)).find((l) => l.name === "TC")?.tracks.length === 3, "");

  const otherLanguage = await expect("re-applying the template from the Arabic UI",
    call("dirA", "applyLevelTemplate", picked, "ar"), "ok");
  check("[P4 action] …does not duplicate filières created in French",
    otherLanguage.ok && otherLanguage.data.tracks === 0, JSON.stringify(otherLanguage.data ?? {}));

  await expect("director B applies the template in Arabic",
    call("dirB", "applyLevelTemplate", { levels: ["TC"], tracks: ["tcSciences"] }, "ar"), "ok");
  check("[P4 action] …filière named in Arabic, in school B only",
    (await levelsOf(B.id)).find((l) => l.name === "TC")?.tracks[0]?.name === "العلوم", "");

  // --- Levels ------------------------------------------------------------------
  const created = await expect("director creates a level",
    call("dirA", "createLevel", { name: "CP", cycle: "primaire" }), "ok");
  const cp = created.ok ? created.data.id : null;
  await expect("duplicate level name (any case) → levelNameTaken",
    call("dirA", "createLevel", { name: "1ac", cycle: "college" }), "levelNameTaken");
  await expect("unknown cycle → cycleRequired",
    call("dirA", "createLevel", { name: "X", cycle: "university" }), "cycleRequired");
  await expect("surveillant cannot create a level",
    call("survA", "createLevel", { name: "CE1", cycle: "primaire" }), "forbidden");
  await expect("director edits a level", call("dirA", "updateLevel", cp, { name: "CP1", cycle: "primaire" }), "ok");
  const bLevel = (await levelsOf(B.id))[0];
  await expect("director A cannot edit school B's level",
    call("dirA", "updateLevel", bLevel?.id, { name: "x", cycle: "college" }), "notFound");

  const college = () =>
    afterSort((async () => (await levelsOf(A.id)).filter((l) => l.cycle === "college"))());
  const firstId = (await college())[0]?.id;
  await expect("director moves the first college level down", call("dirA", "moveLevel", firstId, "down"), "ok");
  check("[P4 action] …it is now second", (await college())[1]?.id === firstId, "");
  await expect("moving the first level up does nothing", call("dirA", "moveLevel", (await college())[0]?.id, "up"), "ok");
  await expect("director A cannot reorder school B's level", call("dirA", "moveLevel", bLevel?.id, "down"), "notFound");

  // --- Filières ----------------------------------------------------------------
  const tcId = (await levelsOf(A.id)).find((l) => l.name === "TC")?.id;
  const added = await expect("director adds a filière", call("dirA", "createTrack", tcId, { name: "Arts" }), "ok");
  await expect("duplicate filière (any case) → trackNameTaken",
    call("dirA", "createTrack", tcId, { name: "ARTS" }), "trackNameTaken");
  await expect("director A cannot add a filière to school B's level",
    call("dirA", "createTrack", bLevel?.id, { name: "Spy" }), "notFound");
  const trackId = added.ok ? added.data.id : null;
  await expect("director renames a filière", call("dirA", "renameTrack", trackId, { name: "Arts appliqués" }), "ok");
  const bTrack = (await levelsOf(B.id)).find((l) => l.name === "TC")?.tracks[0]?.id;
  await expect("director A cannot rename school B's filière",
    call("dirA", "renameTrack", bTrack, { name: "x" }), "notFound");
  await expect("director A cannot delete school B's filière", call("dirA", "deleteTrack", bTrack), "notFound");
  await expect("director deletes a filière", call("dirA", "deleteTrack", trackId), "ok");

  // --- Delete level ------------------------------------------------------------
  await expect("director B cannot delete school A's level", call("dirB", "deleteLevel", tcId), "notFound");
  await expect("director deletes a level with its filières", call("dirA", "deleteLevel", tcId), "ok");
  check("[P4 action] the level is gone", !(await levelsOf(A.id)).some((l) => l.id === tcId), "");
}

async function afterSort(promise) {
  const list = await promise;
  return list.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}
