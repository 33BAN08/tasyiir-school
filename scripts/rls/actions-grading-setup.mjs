// Phase 11 step 2 Server Actions + page (/setup/grading): semesters (edit,
// lock), rules per level (save, reset), coefficients (save, remove, reorder)
// and the two copies (to other levels, from an earlier year), called over HTTP
// as real users on the page that registers them. Director (grades.manage)
// changes; the surveillant (grades.view) reads the page without any control;
// a teacher is sent home; school B touches nothing of A.
import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin } from "./fixtures.mjs";

const PAGE = "/fr/setup/grading";
const FILES = {
  updatePeriod: "src/lib/grading/period-actions.ts",
  setPeriodLocked: "src/lib/grading/period-actions.ts",
  saveLevelRules: "src/lib/grading/rules-actions.ts",
  resetLevelRules: "src/lib/grading/rules-actions.ts",
  saveCoefficient: "src/lib/grading/coefficient-actions.ts",
  removeCoefficient: "src/lib/grading/coefficient-actions.ts",
  reorderCoefficients: "src/lib/grading/coefficient-actions.ts",
  previewLevelCopy: "src/lib/grading/copy-actions.ts",
  copyLevelCoefficients: "src/lib/grading/copy-actions.ts",
  previewYearCopy: "src/lib/grading/copy-actions.ts",
  copyGradingFromYear: "src/lib/grading/copy-actions.ts",
};

export async function gradingSetupActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const label = (s) => `[P11 setup action] ${s}`;
  const ids = Object.fromEntries(Object.entries(FILES).map(([name, file]) => [name, actionId(file, name)]));
  const cookies = {};
  for (const name of ["dirA", "survA", "tchA", "dirB"]) cookies[name] = await sessionCookies(fx.users[name]);
  const call = (who, action, ...args) => callAction(baseUrl, { id: ids[action], path: PAGE, args, cookies: cookies[who] });
  const expect = async (name, promise, wanted, field) => {
    const r = await promise;
    const got = r.ok ? "ok" : r.error;
    check(label(name), got === wanted && (!field || r.field === field), `${got}${r.field ? ` (${r.field})` : ""}`);
    return r;
  };
  const must = (r, what) => {
    if (r.error) throw new Error(`gradingSetupActions setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (q, what) => must(await q.select("id").single(), what).id;
  const page = async (who, query) => {
    const res = await fetch(new URL(`${PAGE}${query}`, baseUrl), { headers: { cookie: cookies[who] }, redirect: "manual" });
    const html = res.status === 200 ? await res.text() : "";
    const streamed = html.match(/NEXT_REDIRECT;\w+;([^;]+);/)?.[1];
    return { status: res.status, redirect: streamed ?? res.headers.get("location") ?? "", html: streamed ? "" : html };
  };

  // --- Fixtures: an earlier and a later far-future year, two levels (one with a filière), two subjects ----
  const year = (start) => id(admin.from("academic_years").insert({
    school_id: A.id, label: `G${start}-${fx.run}`, start_date: `${start}-09-01`, end_date: `${start + 1}-06-30`, is_current: false,
  }), `year ${start}`);
  const prev = await year(2074);
  const cur = await year(2075);
  const l1 = await id(admin.from("levels").insert({ school_id: A.id, cycle: "college", name: `GS 1AC ${fx.run}` }), "l1");
  const l2 = await id(admin.from("levels").insert({ school_id: A.id, cycle: "college", name: `GS 2AC ${fx.run}` }), "l2");
  const track = await id(admin.from("tracks").insert({ school_id: A.id, level_id: l1, name: `GS SM ${fx.run}` }), "track");
  const maths = await id(admin.from("subjects").insert({ school_id: A.id, name: `GS Maths ${fx.run}` }), "maths");
  const pc = await id(admin.from("subjects").insert({ school_id: A.id, name: `GS PC ${fx.run}` }), "pc");
  const periods = async (y) => (await admin.from("grading_periods").select("*").eq("academic_year_id", y).order("number")).data ?? [];
  const [s1, s2] = await periods(cur);

  // --- Page access --------------------------------------------------------------------------------------
  const dirPage = await page("dirA", `?year=${cur}`);
  check(label("director: the page shows the year's two semesters"),
    dirPage.status === 200 && dirPage.html.includes(`data-period="1"`) && dirPage.html.includes(`data-period="2"`),
    `${dirPage.status} ${dirPage.redirect}`);
  // The structure tabs render (a server crash inside their Suspense boundary still answers 200).
  check(label("director: the structure tabs render, Notes among them"),
    dirPage.html.includes(`href="/fr/setup/grading"`) && dirPage.html.includes(`href="/fr/setup/years"`));
  const survPage = await page("survA", `?year=${cur}`);
  check(label("surveillant (grades.view): the page opens"),
    survPage.status === 200 && survPage.html.includes(`data-period="1"`), `${survPage.status} ${survPage.redirect}`);
  check(label("surveillant: no structure tabs (Notes is the only one)"), !survPage.html.includes(`href="/fr/setup/years"`));
  const tchPage = await page("tchA", "");
  check(label("teacher: sent home"), tchPage.redirect !== "" && !tchPage.html.includes("data-period="),
    `${tchPage.status} ${tchPage.redirect}`);

  // --- Semesters ----------------------------------------------------------------------------------------
  const period = (p, values) => ({ startDate: p.start_date, endDate: p.end_date, weight: String(p.weight), ...values });
  await expect("surveillant cannot change a semester", call("survA", "updatePeriod", s2.id, period(s2, { weight: "2" })), "forbidden");
  await expect("teacher cannot change a semester", call("tchA", "updatePeriod", s2.id, period(s2, { weight: "2" })), "forbidden");
  await expect("director sets S2's weight to 1,5", call("dirA", "updatePeriod", s2.id, period(s2, { weight: "1,5" })), "ok");
  check(label("…stored as 1.5"), Number((await periods(cur))[1].weight) === 1.5);
  await expect("weight 0 → weightRange", call("dirA", "updatePeriod", s2.id, period(s2, { weight: "0" })), "weightRange", "weight");
  await expect("end before start → endBeforeStart",
    call("dirA", "updatePeriod", s1.id, period(s1, { endDate: "2075-08-01" })), "endBeforeStart", "endDate");
  await expect("overlapping S2 → periodOverlap",
    call("dirA", "updatePeriod", s1.id, period(s1, { endDate: "2076-02-10" })), "periodOverlap", "startDate");
  await expect("outside the year → periodOutsideYear",
    call("dirA", "updatePeriod", s1.id, period(s1, { startDate: "2075-08-01" })), "periodOutsideYear", "startDate");
  await expect("director B cannot change A's semester", call("dirB", "updatePeriod", s2.id, period(s2)), "notFound");
  await expect("not an id → notFound", call("dirA", "updatePeriod", "nope", period(s2)), "notFound");

  await expect("surveillant cannot lock", call("survA", "setPeriodLocked", s1.id, true), "forbidden");
  await expect("director B cannot lock A's semester", call("dirB", "setPeriodLocked", s1.id, true), "notFound");
  await expect("director locks S1", call("dirA", "setPeriodLocked", s1.id, true), "ok");
  const locked = (await periods(cur))[0];
  check(label("…locked by the director"), locked.locked_at !== null && locked.locked_by === fx.users.dirA.id);
  await expect("a locked semester's dates cannot change",
    call("dirA", "updatePeriod", s1.id, period(s1, { endDate: "2076-01-30" })), "periodLocked");
  const lockedPage = await page("dirA", `?year=${cur}`);
  check(label("the page shows S1 locked, S2 open"),
    lockedPage.html.includes(`data-period="1" data-locked="true"`) && lockedPage.html.includes(`data-period="2" data-locked="false"`));
  await expect("director unlocks S1", call("dirA", "setPeriodLocked", s1.id, false), "ok");
  check(label("…unlocked"), (await periods(cur))[0].locked_at === null);

  // --- Rules per level ----------------------------------------------------------------------------------
  const rules = async () => (await admin.from("grade_level_settings").select("*").eq("academic_year_id", cur).eq("level_id", l1)).data ?? [];
  await expect("surveillant cannot set a level's rules",
    call("survA", "saveLevelRules", cur, l1, { scale: 20, controlsCount: "3", activities: true }), "forbidden");
  await expect("director sets 1AC: /20, 3 contrôles, activités",
    call("dirA", "saveLevelRules", cur, l1, { scale: 20, controlsCount: "3", activities: true }), "ok");
  let row = (await rules())[0];
  check(label("…one row, who recorded"), row?.scale === 20 && row.controls_count === 3 && row.activities === true
    && row.updated_by === fx.users.dirA.id, JSON.stringify(row));
  await expect("saving again changes the same row",
    call("dirA", "saveLevelRules", cur, l1, { scale: 10, controlsCount: 2, activities: false }), "ok");
  const after = await rules();
  check(label("…still one row, new values"), after.length === 1 && after[0].scale === 10 && after[0].controls_count === 2);
  await expect("11 contrôles → controlsRange",
    call("dirA", "saveLevelRules", cur, l1, { scale: 20, controlsCount: "11", activities: false }), "controlsRange", "controlsCount");
  await expect("scale 15 → scaleInvalid",
    call("dirA", "saveLevelRules", cur, l1, { scale: 15, controlsCount: "4", activities: false }), "scaleInvalid", "scale");
  const rulesPage = await page("survA", `?year=${cur}&section=rules`);
  check(label("surveillant reads the rules page without controls"),
    rulesPage.html.includes(`data-level-rules="${l1}"`) && !rulesPage.html.includes(`id="controls-${l1}"`));
  const dirRules = await page("dirA", `?year=${cur}&section=rules`);
  check(label("director gets the rule controls"), dirRules.html.includes(`id="controls-${l1}"`));
  const { ok: crossOk } = await call("dirB", "saveLevelRules", cur, l1, { scale: 20, controlsCount: "4", activities: false });
  check(label("director B cannot set rules on A's level"), !crossOk && (await rules())[0]?.scale === 10);
  await expect("surveillant cannot reset", call("survA", "resetLevelRules", cur, l1), "forbidden");
  await expect("director resets 1AC to the defaults", call("dirA", "resetLevelRules", cur, l1), "ok");
  check(label("…row gone (= defaults)"), (await rules()).length === 0);

  // --- Coefficients -------------------------------------------------------------------------------------
  const common = { yearId: cur, levelId: l1, trackId: null };
  const filiere = { yearId: cur, levelId: l1, trackId: track };
  const coefs = async (y = cur) => (await admin.from("subject_coefficients")
    .select("level_id, track_id, subject_id, coefficient, controls_count, position").eq("academic_year_id", y)).data ?? [];
  const find = (list, level, subject, trk = null) => list.find((r) => r.level_id === level && r.subject_id === subject && r.track_id === trk);

  await expect("surveillant cannot add a coefficient",
    call("survA", "saveCoefficient", common, maths, { coefficient: "2", controlsCount: "" }), "forbidden");
  await expect("director adds Maths, coefficient 2,5",
    call("dirA", "saveCoefficient", common, maths, { coefficient: "2,5", controlsCount: "" }), "ok");
  await expect("director adds PC, coefficient 2, 2 contrôles",
    call("dirA", "saveCoefficient", common, pc, { coefficient: 2, controlsCount: "2" }), "ok");
  let list = await coefs();
  check(label("…stored with the level's contrôles (null) / 2, in order 1, 2"),
    Number(find(list, l1, maths)?.coefficient) === 2.5 && find(list, l1, maths)?.controls_count === null
      && find(list, l1, maths)?.position === 1 && find(list, l1, pc)?.position === 2 && find(list, l1, pc)?.controls_count === 2,
    JSON.stringify(list));
  await expect("changing Maths keeps one row", call("dirA", "saveCoefficient", common, maths, { coefficient: "3", controlsCount: "4" }), "ok");
  list = await coefs();
  check(label("…coefficient 3, 4 contrôles, same place"),
    list.filter((r) => r.subject_id === maths).length === 1 && Number(find(list, l1, maths)?.coefficient) === 3
      && find(list, l1, maths)?.position === 1);
  await expect("coefficient 0 → coefficientRange",
    call("dirA", "saveCoefficient", common, maths, { coefficient: "0", controlsCount: "" }), "coefficientRange", "coefficient");
  await expect("coefficient 1,234 → coefficientRange",
    call("dirA", "saveCoefficient", common, maths, { coefficient: "1,234", controlsCount: "" }), "coefficientRange", "coefficient");
  await expect("coefficient 21 → coefficientRange",
    call("dirA", "saveCoefficient", common, maths, { coefficient: "21", controlsCount: "" }), "coefficientRange", "coefficient");
  await expect("0 contrôles → controlsRange",
    call("dirA", "saveCoefficient", common, maths, { coefficient: "3", controlsCount: "0" }), "controlsRange", "controlsCount");
  await expect("director sets Maths for the filière", call("dirA", "saveCoefficient", filiere, maths, { coefficient: "5", controlsCount: "" }), "ok");
  check(label("…a separate filière row"), Number(find(await coefs(), l1, maths, track)?.coefficient) === 5);
  const { ok: crossCoef } = await call("dirB", "saveCoefficient", common, maths, { coefficient: "9", controlsCount: "" });
  check(label("director B cannot change A's coefficients"), !crossCoef && Number(find(await coefs(), l1, maths)?.coefficient) === 3);

  await expect("surveillant cannot reorder", call("survA", "reorderCoefficients", common, [pc, maths]), "forbidden");
  await expect("director puts PC first", call("dirA", "reorderCoefficients", common, [pc, maths]), "ok");
  list = await coefs();
  check(label("…PC 1, Maths 2"), find(list, l1, pc)?.position === 1 && find(list, l1, maths)?.position === 2);
  await expect("a subject not in the list → notFound", call("dirA", "reorderCoefficients", common, [pc, track]), "notFound");
  await expect("the same subject twice → notFound", call("dirA", "reorderCoefficients", common, [pc, pc]), "notFound");

  const coefPage = await page("survA", `?year=${cur}&section=coefficients&level=${l1}`);
  check(label("surveillant reads the coefficients without inputs"),
    coefPage.html.includes(`data-coefficient="${maths}"`) && !coefPage.html.includes(`id="coef-${maths}"`));
  const dirCoef = await page("dirA", `?year=${cur}&section=coefficients&level=${l1}&track=${track}`);
  check(label("director: filière view shows Maths' own row and PC inherited"),
    dirCoef.html.includes(`id="coef-${maths}"`) && dirCoef.html.includes(`data-coefficient="${pc}" data-graded="false"`));

  await expect("surveillant cannot remove", call("survA", "removeCoefficient", filiere, maths), "forbidden");
  await expect("director sends the filière back to the common core", call("dirA", "removeCoefficient", filiere, maths), "ok");
  check(label("…filière row gone, common row kept"),
    !find(await coefs(), l1, maths, track) && !!find(await coefs(), l1, maths));
  await expect("removing it again → notFound", call("dirA", "removeCoefficient", filiere, maths), "notFound");

  // --- Copy to other levels -----------------------------------------------------------------------------
  await expect("surveillant cannot preview a level copy", call("survA", "previewLevelCopy", common, [l2]), "forbidden");
  await expect("no target level → pickLevels", call("dirA", "previewLevelCopy", common, []), "pickLevels", "levels");
  const lp = await expect("director previews 1AC → 2AC", call("dirA", "previewLevelCopy", common, [l2]), "ok");
  check(label("…two subjects to copy, nothing written"),
    lp.data?.length === 2 && lp.data.every((l) => l.toLevelId === l2 && l.status === "copy")
      && (await coefs()).filter((r) => r.level_id === l2).length === 0, JSON.stringify(lp.data));
  await expect("director copies 1AC → 2AC", call("dirA", "copyLevelCoefficients", common, [l2]), "ok");
  list = await coefs();
  check(label("…2AC gets the same coefficients and order"),
    Number(find(list, l2, maths)?.coefficient) === 3 && find(list, l2, maths)?.position === 2 && find(list, l2, pc)?.position === 1);
  const again = await call("dirA", "previewLevelCopy", common, [l2]);
  check(label("…a second preview: everything already set"), again.ok && again.data.every((l) => l.status === "exists"));
  await expect("director B cannot copy A's level", call("dirB", "copyLevelCoefficients", common, [l2]), "notFound");

  // --- Copy from an earlier year ------------------------------------------------------------------------
  must(await admin.from("grade_level_settings").insert({ school_id: A.id, academic_year_id: prev, level_id: l2, scale: 10, controls_count: 3 }), "prev rules");
  must(await admin.from("subject_coefficients").insert({ school_id: A.id, academic_year_id: prev, level_id: l2, subject_id: maths, coefficient: 7 }), "prev maths");
  must(await admin.from("subject_coefficients").insert({ school_id: A.id, academic_year_id: prev, level_id: l1, track_id: track, subject_id: pc, coefficient: 4 }), "prev SM pc");
  await expect("surveillant cannot preview a year copy", call("survA", "previewYearCopy", prev, cur), "forbidden");
  await expect("a later year into an earlier one → sourceNotEarlier", call("dirA", "previewYearCopy", cur, prev), "sourceNotEarlier");
  const yp = await expect("director previews 2074 → 2075", call("dirA", "previewYearCopy", prev, cur), "ok");
  const lines = (yp.data ?? []).map((l) => `${l.kind}:${l.levelId === l1 ? "l1" : "l2"}:${l.trackId ? "SM" : "-"}:${l.status}`).sort();
  check(label("…2AC rules to copy, 2AC Maths kept (already set), SM PC to copy"),
    lines.join() === ["coefficient:l1:SM:copy", "coefficient:l2:-:exists", "rules:l2:-:copy"].sort().join(), lines.join());
  await expect("director copies 2074 → 2075", call("dirA", "copyGradingFromYear", prev, cur), "ok");
  list = await coefs();
  const copiedRules = (await admin.from("grade_level_settings").select("*").eq("academic_year_id", cur).eq("level_id", l2)).data ?? [];
  check(label("…2AC rules and the filière's PC arrive; 2AC Maths keeps its value"),
    copiedRules[0]?.scale === 10 && Number(find(list, l1, pc, track)?.coefficient) === 4 && Number(find(list, l2, maths)?.coefficient) === 3);
  await expect("director B cannot copy A's years", call("dirB", "copyGradingFromYear", prev, cur), "notFound");

  // --- Cleanup ------------------------------------------------------------------------------------------
  must(await admin.from("academic_years").delete().in("id", [prev, cur]), "years delete");
  await admin.from("subjects").delete().in("id", [maths, pc]);
  await admin.from("levels").delete().in("id", [l1, l2]);
}
