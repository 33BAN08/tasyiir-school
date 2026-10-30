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
  saveCoefficientGrid: "src/lib/grading/coefficient-actions.ts",
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
  await expect("director sets how averages are computed (activités 1,5, absent = 0, truncated, dense)",
    call("dirA", "saveLevelRules", cur, l1, { scale: 20, controlsCount: 3, activities: true, activitiesWeight: "1,5", absentAsZero: true, rounding: "truncate", ranking: "dense" }), "ok");
  row = (await admin.from("grade_level_settings").select("activities_weight, absent_as_zero, rounding, ranking").eq("academic_year_id", cur).eq("level_id", l1).single()).data;
  check(label("…stored"), Number(row?.activities_weight) === 1.5 && row?.absent_as_zero === true && row?.rounding === "truncate" && row?.ranking === "dense", JSON.stringify(row));
  await expect("saving without the calculation fields keeps them",
    call("dirA", "saveLevelRules", cur, l1, { scale: 20, controlsCount: 3, activities: true }), "ok");
  row = (await admin.from("grade_level_settings").select("activities_weight, rounding").eq("academic_year_id", cur).eq("level_id", l1).single()).data;
  check(label("…still 1,5 and truncated"), Number(row?.activities_weight) === 1.5 && row?.rounding === "truncate", JSON.stringify(row));
  await expect("activités weight 0 → activitiesWeightRange",
    call("dirA", "saveLevelRules", cur, l1, { scale: 20, controlsCount: 3, activities: true, activitiesWeight: "0" }), "activitiesWeightRange", "activitiesWeight");
  await expect("activités weight 1,25 (2 decimals) → activitiesWeightRange",
    call("dirA", "saveLevelRules", cur, l1, { scale: 20, controlsCount: 3, activities: true, activitiesWeight: "1,25" }), "activitiesWeightRange", "activitiesWeight");
  const { ok: badRounding } = await call("dirA", "saveLevelRules", cur, l1, { scale: 20, controlsCount: 3, activities: true, rounding: "ceil" });
  check(label("an unknown rounding is refused"), !badRounding);
  const calcPage = await page("dirA", `?year=${cur}&section=rules`);
  check(label("director gets the calculation fields"), calcPage.html.includes(`data-level-calc="${l1}"`) && calcPage.html.includes(`id="rounding-${l1}"`));
  const calcRead = await page("survA", `?year=${cur}&section=rules`);
  check(label("surveillant reads them as one line, no field"), calcRead.html.includes("data-level-calc-summary") && !calcRead.html.includes(`id="rounding-${l1}"`));
  await expect("back to /10, 2 contrôles", call("dirA", "saveLevelRules", cur, l1, { scale: 10, controlsCount: 2, activities: false }), "ok");
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

  // --- Coefficient grid: every changed cell in one call ---------------------------------------------------
  const coefs = async (y = cur) => (await admin.from("subject_coefficients")
    .select("level_id, track_id, subject_id, coefficient, controls_count, position").eq("academic_year_id", y)
    .order("level_id").order("track_id", { nullsFirst: true }).order("subject_id")).data ?? [];
  // First row that differs between two reads (for the check's detail), or "" when they match.
  const firstDiff = (before, after) => {
    for (let i = 0; i < Math.max(before.length, after.length); i++) {
      if (JSON.stringify(before[i]) !== JSON.stringify(after[i])) {
        return `row ${i}: before ${JSON.stringify(before[i] ?? null)} after ${JSON.stringify(after[i] ?? null)}`;
      }
    }
    return "";
  };
  const find = (list, level, subject, trk = null) => list.find((r) => r.level_id === level && r.subject_id === subject && r.track_id === trk);
  const cell = (levelId, subjectId, coefficient, extra = {}) =>
    ({ levelId, trackId: null, subjectId, coefficient, controlsCount: null, position: 1, ...extra });
  const grid = (who, cells) => call(who, "saveCoefficientGrid", cur, cells);

  await expect("surveillant cannot save the grid", grid("survA", [cell(l1, maths, 2)]), "forbidden");
  await expect("teacher cannot save the grid", grid("tchA", [cell(l1, maths, 2)]), "forbidden");
  const first = await expect("director saves 4 cells at once (\"2,5\" accepted)", grid("dirA", [
    cell(l1, maths, "2,5", { position: 2 }),
    cell(l1, pc, 2, { controlsCount: "2", position: 1 }),
    cell(l2, maths, 3, { position: 2 }),
    cell(l1, maths, 5, { trackId: track, position: 2 }),
  ]), "ok");
  let list = await coefs();
  check(label("…4 rows: values, contrôles override, order, the filière row"),
    first.data?.saved === 4 && Number(find(list, l1, maths)?.coefficient) === 2.5 && find(list, l1, pc)?.controls_count === 2
      && find(list, l1, pc)?.position === 1 && Number(find(list, l2, maths)?.coefficient) === 3
      && Number(find(list, l1, maths, track)?.coefficient) === 5 && list.length === 4, JSON.stringify(list));

  const unchanged = await coefs();
  const bad = async (name, cells, wanted) => {
    const r = await expect(name, grid("dirA", cells), wanted);
    return r;
  };
  const r0 = await bad("coefficient 0 → coefficientRange, nothing saved", [cell(l2, pc, 4), cell(l1, maths, 0)], "coefficientRange");
  check(label("…the invalid cell is named"), r0.cell === `${l1}||${maths}`, String(r0.cell));
  await bad("coefficient 1,234 → coefficientRange", [cell(l2, pc, 4), cell(l1, maths, "1,234")], "coefficientRange");
  await bad("coefficient 21 → coefficientRange", [cell(l2, pc, 4), cell(l1, maths, 21)], "coefficientRange");
  await bad("0 contrôles → controlsRange", [cell(l2, pc, 4), cell(l1, maths, 3, { controlsCount: "0" })], "controlsRange");
  await bad("a filière of another level → the database refuses the whole save", [cell(l2, pc, 4), cell(l2, maths, 3, { trackId: track })], "inUse");
  await bad("501 cells → tooManyCells", Array.from({ length: 501 }, () => cell(l1, maths, 1)), "tooManyCells");
  const diff = firstDiff(unchanged, await coefs());
  check(label("…nothing saved by any refused grid"), diff === "", diff);
  await expect("director B cannot save into A's year", grid("dirB", [cell(l1, maths, 9)]), "notFound");
  const empty = await expect("an empty save does nothing", grid("dirA", []), "ok");
  check(label("…0 saved"), empty.data?.saved === 0);

  await expect("director clears PC in 1AC and the filière's Maths in one save",
    grid("dirA", [cell(l1, pc, null), cell(l1, maths, null, { trackId: track }), cell(l1, maths, 2.5, { position: 1 })]), "ok");
  list = await coefs();
  check(label("…PC no longer graded in 1AC, the filière back to the common core, Maths moved first"),
    !find(list, l1, pc) && !find(list, l1, maths, track) && find(list, l1, maths)?.position === 1 && list.length === 2);

  const survGrid = await page("survA", `?year=${cur}&section=coefficients&cycle=college`);
  check(label("surveillant reads the grid without inputs"),
    survGrid.html.includes(`data-cell="${l1}||${maths}"`) && !survGrid.html.includes("data-changed="));
  const dirGrid = await page("dirA", `?year=${cur}&section=coefficients&cycle=college`);
  check(label("director: a column per level + one for 1AC's filière, none for 2AC"),
    dirGrid.html.includes(`data-column="${l1}|"`) && dirGrid.html.includes(`data-column="${l1}|${track}"`)
      && dirGrid.html.includes(`data-column="${l2}|"`) && !new RegExp(`data-column="${l2}[|][0-9a-f]`).test(dirGrid.html)
      && dirGrid.html.includes(`data-cell="${l1}|${track}|${maths}"`) && dirGrid.html.includes("data-changed="));

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
