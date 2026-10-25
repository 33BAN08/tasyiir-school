// Phase 11 step 2 (UX): save_subject_coefficients(year, cells) — the
// coefficient grid saved in one transaction. Adds, changes and removes rows
// (common and filière), all or nothing; grades.manage of the year's school
// only, grades module on; the existing CHECKs and FKs still refuse bad cells.
import { check } from "./checks.mjs";
import { admin } from "./fixtures.mjs";

export async function phase11SaveCoefficients({ fx, as }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const label = (s) => `[P11 grid] ${s}`;
  const must = (r, what) => {
    if (r.error) throw new Error(`phase11SaveCoefficients setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (q, what) => must(await q.select("id").single(), what).id;

  const year = await id(admin.from("academic_years").insert({
    school_id: A.id, label: `P11s-${fx.run}`, start_date: "2085-09-01", end_date: "2086-06-30", is_current: false,
  }), "year");
  const yearB = await id(admin.from("academic_years").insert({
    school_id: B.id, label: `P11s-${fx.run}`, start_date: "2085-09-01", end_date: "2086-06-30", is_current: false,
  }), "year B");
  const level = (name, school = A.id) => id(admin.from("levels").insert({ school_id: school, cycle: "lycee", name: `${name} ${fx.run}` }), name);
  const l1 = await level("P11s 1BAC");
  const l2 = await level("P11s 2BAC");
  const levelB = await level("P11s B", B.id);
  const sm = await id(admin.from("tracks").insert({ school_id: A.id, level_id: l2, name: `P11s SM ${fx.run}` }), "SM");
  const other = await id(admin.from("tracks").insert({ school_id: A.id, level_id: l1, name: `P11s X ${fx.run}` }), "X");
  const subject = (name, school = A.id) => id(admin.from("subjects").insert({ school_id: school, name: `${name} ${fx.run}` }), name);
  const maths = await subject("P11s Maths");
  const pc = await subject("P11s PC");
  const subjectB = await subject("P11s B", B.id);
  must(await admin.from("subject_coefficients").insert({ school_id: A.id, academic_year_id: year, level_id: l1, subject_id: pc, coefficient: 2, position: 2 }), "pc l1");

  const rows = async () => (await admin.from("subject_coefficients")
    .select("level_id, track_id, subject_id, coefficient, controls_count, position").eq("academic_year_id", year)
    .order("level_id").order("subject_id").order("track_id", { nullsFirst: true })).data ?? [];
  const find = (list, lvl, sub, trk = null) => list.find((r) => r.level_id === lvl && r.subject_id === sub && r.track_id === trk);
  const save = (client, cells, y = year) => client.rpc("save_subject_coefficients", { p_year: y, p_cells: cells });
  const cell = (level_id, subject_id, coefficient, extra = {}) => ({ level_id, subject_id, track_id: null, coefficient, controls_count: null, position: 1, ...extra });
  const refused = async (name, call, wanted) => {
    const { error } = await call;
    check(label(name), !!error && (error.code === wanted || error.message?.includes(wanted)), error ? `${error.code} ${error.message}` : "accepted!");
  };

  // --- Adds, changes and removes in one call --------------------------------------------------------
  const { data: n, error } = await save(as.dirA, [
    cell(l1, maths, 3, { controls_count: 2, position: 1 }),
    cell(l2, maths, 4, { position: 1 }),
    cell(l2, maths, 6, { track_id: sm, position: 1 }),
    cell(l1, pc, null),
    cell(l2, pc, 1.5, { position: 2 }),
  ]);
  let list = await rows();
  check(label("the director saves 5 cells in one call (4 added / changed, 1 removed)"), !error && n === 5, error?.message ?? String(n));
  check(label("…common rows with coefficient, contrôles override and order"),
    Number(find(list, l1, maths)?.coefficient) === 3 && find(list, l1, maths)?.controls_count === 2
      && Number(find(list, l2, maths)?.coefficient) === 4 && Number(find(list, l2, pc)?.coefficient) === 1.5 && find(list, l2, pc)?.position === 2);
  check(label("…a filière row next to the common one"), Number(find(list, l2, maths, sm)?.coefficient) === 6 && list.length === 4);
  check(label("…a cleared cell removes the row"), !find(list, l1, pc));

  const { data: n2 } = await save(as.dirA, [cell(l2, maths, 5, { position: 3 }), cell(l2, maths, null, { track_id: sm })]);
  list = await rows();
  check(label("changing a cell keeps one row; clearing the filière cell goes back to the common value"),
    n2 === 2 && Number(find(list, l2, maths)?.coefficient) === 5 && find(list, l2, maths)?.position === 3
      && !find(list, l2, maths, sm) && list.filter((r) => r.subject_id === maths).length === 2);
  const { data: none } = await save(as.dirA, [cell(l1, pc, null)]);
  check(label("removing a cell that is already empty: nothing happens"), none === 0);
  const { data: empty } = await save(as.dirA, []);
  check(label("an empty save: nothing happens"), empty === 0);

  // --- All or nothing --------------------------------------------------------------------------------
  const before = JSON.stringify(await rows());
  await refused("one coefficient out of range refuses the whole save",
    save(as.dirA, [cell(l1, maths, 9), cell(l2, maths, 25)]), "23514");
  await refused("one bad contrôles count refuses the whole save",
    save(as.dirA, [cell(l1, maths, 9), cell(l2, maths, 2, { controls_count: 11 })]), "23514");
  await refused("a filière of another level refuses the whole save",
    save(as.dirA, [cell(l1, maths, 9), cell(l1, pc, 2, { track_id: sm })]), "23503");
  await refused("B's subject refuses the whole save",
    save(as.dirA, [cell(l1, maths, 9), cell(l1, subjectB, 2)]), "23503");
  await refused("B's level refuses the whole save",
    save(as.dirA, [cell(l1, maths, 9), cell(levelB, maths, 2)]), "23503");
  check(label("…nothing changed after the refused saves"), JSON.stringify(await rows()) === before);
  await refused("more than 500 cells", save(as.dirA, Array.from({ length: 501 }, () => cell(l1, maths, 1))), "coefficients_too_many");

  // --- Who --------------------------------------------------------------------------------------------
  await refused("the surveillant (grades.view) cannot save", save(as.survA, [cell(l1, maths, 9)]), "coefficients_forbidden");
  await refused("a teacher cannot save", save(as.tchA, [cell(l1, maths, 9)]), "coefficients_forbidden");
  await refused("an office manager cannot save", save(as.mgrA, [cell(l1, maths, 9)]), "coefficients_forbidden");
  await refused("the director of B cannot save into A's year", save(as.dirB, [cell(l1, maths, 9)]), "coefficients_year_not_found");
  const { error: intoA } = await save(as.dirB, [cell(l1, maths, 9)], yearB);
  check(label("the director of B cannot write A's levels from B's year"), !!intoA, intoA?.code ?? "accepted!");
  await refused("the platform owner cannot save", save(as.owner, [cell(l1, maths, 9)]), "coefficients_forbidden");
  const { error: anonError } = await save(as.anon, [cell(l1, maths, 9)]);
  check(label("signed out: no execute"), !!anonError, anonError?.code ?? "accepted!");
  must(await admin.from("school_modules").update({ enabled: false }).eq("school_id", A.id).eq("module_key", "grades"), "module off");
  await refused("grades module off: the director cannot save", save(as.dirA, [cell(l1, maths, 9)]), "coefficients_forbidden");
  must(await admin.from("school_modules").update({ enabled: true }).eq("school_id", A.id).eq("module_key", "grades"), "module on");
  check(label("…A's rows untouched by every refused caller"), JSON.stringify(await rows()) === before);

  // --- Cleanup ------------------------------------------------------------------------------------------
  must(await admin.from("academic_years").delete().in("id", [year, yearB]), "years");
  await admin.from("subjects").delete().in("id", [maths, pc, subjectB]);
  await admin.from("tracks").delete().in("id", [sm, other]);
  await admin.from("levels").delete().in("id", [l1, l2, levelB]);
}
