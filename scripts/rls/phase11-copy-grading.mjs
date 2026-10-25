// Phase 11 step 2: copies of the grading setup — copy_level_coefficients (one
// level or filière → other levels' common rows, same year) and
// copy_grading_from_year (an earlier year's level rules + coefficients → a later
// year). Preview (apply false) writes nothing and reports exactly what the copy
// does; nothing already in the target is ever overwritten; only grades.manage
// (director) of the year's school, grades module on.
import { check } from "./checks.mjs";
import { admin } from "./fixtures.mjs";

export async function phase11CopyGrading({ fx, as }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const label = (s) => `[P11 copy] ${s}`;
  const must = (r, what) => {
    if (r.error) throw new Error(`phase11CopyGrading setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (q, what) => must(await q.select("id").single(), what).id;

  // --- Fixtures: two far-future years in A, one in B, levels, a filière, subjects --------------------------
  const year = (school, label_, start, end) => id(admin.from("academic_years").insert({
    school_id: school, label: `${label_}-${fx.run}`, start_date: start, end_date: end, is_current: false,
  }), `year ${label_}`);
  const prev = await year(A.id, "P11c-prev", "2080-09-01", "2081-06-30");
  const next = await year(A.id, "P11c-next", "2081-09-01", "2082-06-30");
  const yearB = await year(B.id, "P11c-B", "2080-09-01", "2081-06-30");
  const level = (school, name) => id(admin.from("levels").insert({ school_id: school, cycle: "college", name: `${name} ${fx.run}` }), name);
  const l1 = await level(A.id, "P11c 1AC");
  const l2 = await level(A.id, "P11c 2AC");
  const l3 = await level(A.id, "P11c 3AC");
  const l4 = await level(A.id, "P11c TC");
  const levelB = await level(B.id, "P11c B");
  const track = await id(admin.from("tracks").insert({ school_id: A.id, level_id: l1, name: `P11c SM ${fx.run}` }), "track");
  const subject = (school, name) => id(admin.from("subjects").insert({ school_id: school, name: `${name} ${fx.run}` }), name);
  const maths = await subject(A.id, "P11c Maths");
  const pc = await subject(A.id, "P11c PC");
  const subjectB = await subject(B.id, "P11c B");

  const coef = (values) => admin.from("subject_coefficients").insert({ school_id: A.id, ...values });
  must(await coef({ academic_year_id: prev, level_id: l1, subject_id: maths, coefficient: 3, controls_count: 2, position: 1 }), "l1 maths");
  must(await coef({ academic_year_id: prev, level_id: l1, subject_id: pc, coefficient: 2, position: 2 }), "l1 pc");
  must(await coef({ academic_year_id: prev, level_id: l1, track_id: track, subject_id: maths, coefficient: 5, position: 1 }), "l1 SM maths");
  must(await coef({ academic_year_id: prev, level_id: l2, subject_id: maths, coefficient: 7, position: 9 }), "l2 maths (kept)");
  must(await admin.from("grade_level_settings").insert({
    school_id: A.id, academic_year_id: prev, level_id: l1, scale: 20, controls_count: 3, activities: true,
  }), "l1 rules");
  must(await admin.from("subject_coefficients").insert({
    school_id: B.id, academic_year_id: yearB, level_id: levelB, subject_id: subjectB, coefficient: 4,
  }), "B coefficient");

  const coefRows = async (y) => (await admin.from("subject_coefficients")
    .select("level_id, track_id, subject_id, coefficient, controls_count, position").eq("academic_year_id", y)).data ?? [];
  const key = (r) => `${r.level_id}|${r.track_id ?? "-"}|${r.subject_id}`;
  const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

  // --- Level → levels ---------------------------------------------------------------------------------------
  const copyLevel = (client, from, toLevels, apply, opts = {}) => client.rpc("copy_level_coefficients", {
    p_year: opts.year ?? prev, p_from_level: from, p_from_track: opts.track ?? null, p_to_levels: toLevels, p_apply: apply,
  });

  const before = await coefRows(prev);
  const { data: preview, error: previewError } = await copyLevel(as.dirA, l1, [l2, l3, l1, levelB], false);
  const report = (list) => (list ?? []).map((r) => `${r.to_level_id}|${r.subject_id}|${r.status}`).sort();
  const expected = [
    `${l2}|${maths}|exists`, `${l2}|${pc}|copy`, `${l3}|${maths}|copy`, `${l3}|${pc}|copy`,
  ].sort();
  check(label("level preview: each subject per target, 'exists' when the target has it; source level and B's level left out"),
    !previewError && sameSet(report(preview), expected), previewError?.message ?? JSON.stringify(report(preview)));
  const afterPreview = await coefRows(prev);
  check(label("level preview writes nothing"), afterPreview.length === before.length, `${before.length} → ${afterPreview.length}`);

  const { data: applied, error: applyError } = await copyLevel(as.dirA, l1, [l2, l3, l1, levelB], true);
  check(label("level copy reports exactly what the preview said"),
    !applyError && sameSet(report(applied), expected), applyError?.message ?? JSON.stringify(report(applied)));
  const afterCopy = await coefRows(prev);
  const at = (list, lvl, subj, trk = null) => list.find((r) => r.level_id === lvl && r.subject_id === subj && r.track_id === trk);
  const l3maths = at(afterCopy, l3, maths);
  const l3pc = at(afterCopy, l3, pc);
  check(label("copied rows keep coefficient, contrôles override and order (common rows)"),
    Number(l3maths?.coefficient) === 3 && l3maths?.controls_count === 2 && l3maths?.position === 1
      && Number(l3pc?.coefficient) === 2 && l3pc?.controls_count === null && l3pc?.position === 2,
    JSON.stringify([l3maths, l3pc]));
  const l2maths = at(afterCopy, l2, maths);
  check(label("a row already in the target is never overwritten"),
    Number(l2maths?.coefficient) === 7 && l2maths?.position === 9 && Number(at(afterCopy, l2, pc)?.coefficient) === 2,
    JSON.stringify(l2maths));
  check(label("exactly the 3 missing rows were added"), afterCopy.length === before.length + 3, `${before.length} → ${afterCopy.length}`);

  const { data: again } = await copyLevel(as.dirA, l1, [l2, l3], true);
  check(label("copying again: everything 'exists', nothing added"),
    (again ?? []).length === 4 && again.every((r) => r.status === "exists")
      && (await coefRows(prev)).length === afterCopy.length, JSON.stringify(report(again)));

  const { data: fromTrack } = await copyLevel(as.dirA, l1, [l4], true, { track });
  const l4rows = (await coefRows(prev)).filter((r) => r.level_id === l4);
  check(label("a filière's rows copy into another level's COMMON rows"),
    report(fromTrack).join() === `${l4}|${maths}|copy` && l4rows.length === 1
      && l4rows[0].track_id === null && Number(l4rows[0].coefficient) === 5, JSON.stringify(l4rows));

  const refusedCode = async (name, call, message, code) => {
    const { data, error } = await call;
    check(label(name), error?.message === message && (!code || error?.code === code),
      error ? `${error.code} ${error.message}` : `accepted: ${JSON.stringify(data)}`);
  };
  const n = (await coefRows(prev)).length;
  await refusedCode("a surveillant (grades.view) cannot copy between levels",
    copyLevel(as.survA, l1, [l4], true), "copy_grading_forbidden", "42501");
  await refusedCode("a teacher cannot copy between levels", copyLevel(as.tchA, l1, [l4], true), "copy_grading_forbidden", "42501");
  await refusedCode("an office manager cannot copy between levels", copyLevel(as.mgrA, l1, [l4], false), "copy_grading_forbidden", "42501");
  await refusedCode("the director of B cannot copy in A's year", copyLevel(as.dirB, l1, [levelB], true), "copy_grading_not_found", "23503");
  const { data: crossRead } = await copyLevel(as.dirB, l1, [levelB], true, { year: yearB });
  check(label("the director of B, in B's year, sees nothing of A's levels"), (crossRead ?? []).length === 0, JSON.stringify(crossRead));
  const { data: intoA } = await copyLevel(as.dirB, levelB, [l1, l2], true, { year: yearB });
  check(label("…and cannot copy into A's levels"), (intoA ?? []).length === 0, JSON.stringify(intoA));
  check(label("refused copies wrote nothing"), (await coefRows(prev)).length === n);
  const { error: anonError } = await as.anon.rpc("copy_level_coefficients", {
    p_year: prev, p_from_level: l1, p_from_track: null, p_to_levels: [l4], p_apply: false,
  });
  check(label("signed out: no execute"), !!anonError, anonError?.code ?? "accepted!");

  // --- Earlier year → later year ----------------------------------------------------------------------------
  must(await coef({ academic_year_id: next, level_id: l1, subject_id: pc, coefficient: 9, position: 4 }), "next l1 pc (kept)");
  const copyYear = (client, from, to, apply) =>
    client.rpc("copy_grading_from_year", { p_from_year: from, p_to_year: to, p_apply: apply });

  const source = await coefRows(prev);
  const target = await coefRows(next);
  const targetKeys = new Set(target.map(key));
  const yearExpected = [
    `rules|${l1}|-|-|copy`,
    ...source.map((r) => `coefficient|${key(r)}|${targetKeys.has(key(r)) ? "exists" : "copy"}`),
  ].sort();
  const yearReport = (list) => (list ?? []).map((r) =>
    `${r.kind}|${r.level_id}|${r.track_id ?? "-"}|${r.subject_id ?? "-"}|${r.status}`).sort();

  const { data: yPreview, error: yPreviewError } = await copyYear(as.dirA, prev, next, false);
  check(label("year preview: the level rules + every coefficient row, 'exists' when the target has it"),
    !yPreviewError && sameSet(yearReport(yPreview), yearExpected), yPreviewError?.message ?? JSON.stringify(yearReport(yPreview)));
  const rulesNext = async () => (await admin.from("grade_level_settings").select("*").eq("academic_year_id", next)).data ?? [];
  check(label("year preview writes nothing"),
    (await coefRows(next)).length === target.length && (await rulesNext()).length === 0);

  const { data: yApplied, error: yApplyError } = await copyYear(as.dirA, prev, next, true);
  check(label("year copy reports exactly what the preview said"),
    !yApplyError && sameSet(yearReport(yApplied), yearExpected), yApplyError?.message ?? JSON.stringify(yearReport(yApplied)));
  const copied = await coefRows(next);
  const sameValues = source.every((s) => {
    const t = copied.find((r) => key(r) === key(s));
    if (key(s) === `${l1}|-|${pc}`) return Number(t?.coefficient) === 9 && t?.position === 4;
    return t && Number(t.coefficient) === Number(s.coefficient) && t.controls_count === s.controls_count && t.position === s.position;
  });
  check(label("every coefficient row arrives with its values (filière rows too); the existing one is kept"),
    sameValues && copied.length === source.length && copied.some((r) => r.track_id === track), `${copied.length} row(s)`);
  const rules = await rulesNext();
  check(label("the level rules arrive (scale, contrôles, activités, who recorded)"),
    rules.length === 1 && rules[0].level_id === l1 && rules[0].scale === 20 && rules[0].controls_count === 3
      && rules[0].activities === true && rules[0].updated_by === fx.users.dirA.id, JSON.stringify(rules));
  const { data: periodsNext } = await admin.from("grading_periods").select("start_date").eq("academic_year_id", next).order("number");
  check(label("the target year keeps its own semesters"), periodsNext?.[0]?.start_date === "2081-09-01", JSON.stringify(periodsNext));

  const { data: yAgain } = await copyYear(as.dirA, prev, next, true);
  check(label("copying the year again: everything 'exists'"),
    (yAgain ?? []).length === yearExpected.length && yAgain.every((r) => r.status === "exists"));

  await refusedCode("a later year cannot be copied into an earlier one",
    copyYear(as.dirA, next, prev, false), "copy_grading_source_not_earlier", "23514");
  await refusedCode("a year cannot be copied into itself",
    copyYear(as.dirA, prev, prev, false), "copy_grading_source_not_earlier", "23514");
  await refusedCode("a surveillant cannot copy a year", copyYear(as.survA, prev, next, false), "copy_grading_forbidden", "42501");
  await refusedCode("a teacher cannot copy a year", copyYear(as.tchA, prev, next, false), "copy_grading_forbidden", "42501");
  await refusedCode("the director of B cannot copy A's year into B's", copyYear(as.dirB, prev, yearB, false), "copy_grading_not_found", "23503");
  await refusedCode("the director of A cannot copy into B's year", copyYear(as.dirA, prev, yearB, true), "copy_grading_not_found", "23503");
  await refusedCode("suspended school C: its director cannot copy", copyYear(as.dirC, prev, next, false), "copy_grading_forbidden", "42501");
  await refusedCode("the platform owner cannot copy", copyYear(as.owner, prev, next, false), "copy_grading_forbidden", "42501");

  must(await admin.from("school_modules").update({ enabled: false }).eq("school_id", B.id).eq("module_key", "grades"), "B module off");
  await refusedCode("grades module off: the director of B cannot copy", copyLevel(as.dirB, levelB, [levelB], false, { year: yearB }),
    "copy_grading_forbidden", "42501");
  must(await admin.from("school_modules").update({ enabled: true }).eq("school_id", B.id).eq("module_key", "grades"), "B module on");

  // --- Cleanup ----------------------------------------------------------------------------------------------
  must(await admin.from("academic_years").delete().in("id", [prev, next, yearB]), "years delete");
  await admin.from("subjects").delete().in("id", [maths, pc, subjectB]);
  await admin.from("levels").delete().in("id", [l1, l2, l3, l4, levelB]);
}
