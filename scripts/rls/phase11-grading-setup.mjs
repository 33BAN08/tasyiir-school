// Phase 11 step 1: grading setup — grading_periods (semesters, seeded with each
// year, lock), grade_level_settings (scale, number of contrôles, activités) and
// subject_coefficients (per level / filière / subject). Every active account of
// the school reads them while the grades module is on; only grades.manage
// (director) writes; the triggers keep dates inside the year, freeze a locked
// period and record who changed what.
import { randomBytes } from "node:crypto";

import { check, denied, rows } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";

const DAY = 86_400_000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

export async function phase11GradingSetup({ fx, as }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const label = (s) => `[P11 setup] ${s}`;
  const must = (r, what) => {
    if (r.error) throw new Error(`phase11GradingSetup setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (q, what) => must(await q.select("id").single(), what).id;

  // --- Fixtures: a far-future year in A and in B, levels, a filière, a subject ------------------------------
  const yearA = await id(admin.from("academic_years").insert({
    school_id: A.id, label: `P11-${fx.run}`, start_date: "2070-09-01", end_date: "2071-06-30", is_current: false,
  }), "year A");
  const yearB = await id(admin.from("academic_years").insert({
    school_id: B.id, label: `P11-${fx.run}`, start_date: "2070-09-01", end_date: "2071-06-30", is_current: false,
  }), "year B");
  const college = await id(admin.from("levels").insert({ school_id: A.id, cycle: "college", name: `P11 3AC ${fx.run}` }), "college");
  const primaire = await id(admin.from("levels").insert({ school_id: A.id, cycle: "primaire", name: `P11 CE1 ${fx.run}` }), "primaire");
  const track = await id(admin.from("tracks").insert({ school_id: A.id, level_id: college, name: `P11 SM ${fx.run}` }), "track");
  const otherTrack = await id(admin.from("tracks").insert({ school_id: A.id, level_id: primaire, name: `P11 X ${fx.run}` }), "track 2");
  const subject = await id(admin.from("subjects").insert({ school_id: A.id, name: `P11 Maths ${fx.run}` }), "subject");
  const levelB = await id(admin.from("levels").insert({ school_id: B.id, cycle: "college", name: `P11 B ${fx.run}` }), "level B");
  const subjectB = await id(admin.from("subjects").insert({ school_id: B.id, name: `P11 B ${fx.run}` }), "subject B");

  // A parent account of school A (the setup is the school's, no child needed).
  const email = `rls-test+${fx.run}-p11par@example.com`;
  const password = `${randomBytes(12).toString("base64url")}a1`;
  const parUser = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), "parent").user;
  fx.createdUserIds.push(parUser.id);
  must(await admin.from("profiles").insert({
    id: parUser.id, school_id: A.id, role_id: A.roles.parent, full_name: "RLS p11par", must_change_password: false,
  }), "parent profile");
  const parA = await signIn({ email, password });

  const periods = async (year) =>
    (await admin.from("grading_periods").select("*").eq("academic_year_id", year).order("number")).data ?? [];

  // --- Seeded with the year --------------------------------------------------------------------------------
  const seeded = await periods(yearA);
  check(label("a new year gets two semesters: start → 31 January, 1 February → end"),
    seeded.length === 2
      && seeded[0].number === 1 && seeded[0].start_date === "2070-09-01" && seeded[0].end_date === "2071-01-31"
      && seeded[1].number === 2 && seeded[1].start_date === "2071-02-01" && seeded[1].end_date === "2071-06-30"
      && seeded.every((p) => Number(p.weight) === 1 && p.locked_at === null && p.school_id === A.id),
    JSON.stringify(seeded.map((p) => [p.number, p.start_date, p.end_date, p.weight])));

  const odd = await id(admin.from("academic_years").insert({
    school_id: A.id, label: `P11-odd-${fx.run}`, start_date: "2072-02-15", end_date: "2072-12-31", is_current: false,
  }), "odd year");
  const days = (Date.parse("2072-12-31") - Date.parse("2072-02-15")) / DAY + 1;
  const split = iso(Date.parse("2072-02-15") + Math.floor(days / 2) * DAY);
  const oddPeriods = await periods(odd);
  check(label("a year holding no 1 February is split at its midpoint"),
    oddPeriods.length === 2 && oddPeriods[1].start_date === split
      && oddPeriods[0].end_date === iso(Date.parse(split) - DAY),
    JSON.stringify(oddPeriods.map((p) => [p.start_date, p.end_date])));
  must(await admin.from("academic_years").delete().eq("id", odd), "odd year delete");

  const [s1, s2] = seeded;

  // --- Reads ------------------------------------------------------------------------------------------------
  const onlyA = (list) => list.length > 0 && list.every((r) => r.school_id === A.id);
  for (const who of ["dirA", "survA", "tchA", "mgrA", "audA"]) {
    await rows(label(`${who} reads their school's semesters, never B's`),
      as[who].from("grading_periods").select("school_id"), onlyA);
  }
  await rows(label("a parent of A reads A's semesters"), parA.from("grading_periods").select("school_id"), onlyA);
  await rows(label("the director of B reads only B's semesters"), as.dirB.from("grading_periods").select("school_id"),
    (list) => list.length > 0 && list.every((r) => r.school_id === B.id));
  await rows(label("suspended school C: its director reads nothing"), as.dirC.from("grading_periods").select("id"), 0);
  await rows(label("the platform owner reads no school's semesters"), as.owner.from("grading_periods").select("id"), 0);
  const { data: anonRows, error: anonError } = await as.anon.from("grading_periods").select("id");
  check(label("signed out: nothing (no grant)"), anonError?.code === "42501" || anonRows?.length === 0,
    anonError?.code ?? `${anonRows?.length} row(s)`);

  // --- Module off → nothing read or written -----------------------------------------------------------------
  must(await admin.from("school_modules").update({ enabled: false }).eq("school_id", B.id).eq("module_key", "grades"), "B module off");
  await rows(label("grades module off: the director of B reads no semester"), as.dirB.from("grading_periods").select("id"), 0);
  const bPeriod = (await periods(yearB))[1];
  await denied(label("grades module off: the director of B cannot change one"),
    as.dirB.from("grading_periods").update({ weight: 2 }).eq("id", bPeriod.id).select("id"));
  must(await admin.from("school_modules").update({ enabled: true }).eq("school_id", B.id).eq("module_key", "grades"), "B module on");

  // --- Who changes semesters --------------------------------------------------------------------------------
  const setWeight = (client, period, weight) =>
    client.from("grading_periods").update({ weight }).eq("id", period.id).select("id, weight, updated_by");
  await denied(label("a surveillant (grades.view) cannot change a semester"), setWeight(as.survA, s2, 2));
  await denied(label("a teacher cannot change a semester"), setWeight(as.tchA, s2, 2));
  await denied(label("a parent cannot change a semester"), setWeight(parA, s2, 2));
  await denied(label("an office manager cannot change a semester"), setWeight(as.mgrA, s2, 2));
  await denied(label("the director of A cannot change B's semester"), setWeight(as.dirA, bPeriod, 2));
  const { data: weighted, error: weightError } = await setWeight(as.dirA, s2, 2);
  check(label("the director sets S2's weight (who recorded)"),
    !weightError && weighted?.length === 1 && Number(weighted[0].weight) === 2 && weighted[0].updated_by === fx.users.dirA.id,
    weightError?.code ?? JSON.stringify(weighted));

  const refused = async (name, values, code, period = s1) => {
    const { error } = await as.dirA.from("grading_periods").update(values).eq("id", period.id).select("id");
    check(label(`refused: ${name}`), error?.code === code, error ? `${error.code} ${error.message}` : "accepted!");
  };
  await refused("a semester starting before its year", { start_date: "2070-08-31" }, "23514");
  await refused("a semester ending after its year", { end_date: "2071-07-01" }, "23514", s2);
  await refused("two semesters overlapping", { end_date: "2071-02-01" }, "23P01");
  await refused("a semester ending before it starts", { end_date: "2070-08-31", start_date: "2070-09-01" }, "23514");
  await refused("semester number 5", { number: 5 }, "23514");
  await refused("weight 0", { weight: 0 }, "23514");
  await denied(label("the director cannot move a semester to another school"),
    as.dirA.from("grading_periods").update({ school_id: B.id }).eq("id", s1.id).select("id"));
  await denied(label("the director cannot set who locked it"),
    as.dirA.from("grading_periods").update({ locked_by: fx.users.survA.id }).eq("id", s1.id).select("id"));

  // A third period: S2 shortened, then added, then removed again.
  must(await as.dirA.from("grading_periods").update({ end_date: "2071-04-30" }).eq("id", s2.id).select("id"), "shorten S2");
  const { data: third, error: thirdError } = await as.dirA.from("grading_periods")
    .insert({ school_id: A.id, academic_year_id: yearA, number: 3, start_date: "2071-05-01", end_date: "2071-06-30" })
    .select("id, locked_at, created_at");
  check(label("the director adds a third period"), !thirdError && third?.length === 1 && third[0].locked_at === null,
    thirdError?.code ?? JSON.stringify(third));
  await denied(label("a surveillant cannot add a period"),
    as.survA.from("grading_periods").insert({ school_id: A.id, academic_year_id: yearA, number: 4, start_date: "2071-06-30", end_date: "2071-06-30" }).select("id"));
  const { error: crossInsert } = await as.dirA.from("grading_periods")
    .insert({ school_id: B.id, academic_year_id: yearB, number: 3, start_date: "2071-06-01", end_date: "2071-06-30" }).select("id");
  check(label("the director of A cannot add a period to B's year"), !!crossInsert, crossInsert?.code ?? "accepted!");
  const { error: mixInsert } = await as.dirA.from("grading_periods")
    .insert({ school_id: A.id, academic_year_id: yearB, number: 3, start_date: "2071-06-01", end_date: "2071-06-30" }).select("id");
  check(label("…nor into B's year under A's name"), !!mixInsert, mixInsert?.code ?? "accepted!");
  await denied(label("a surveillant cannot delete a period"), as.survA.from("grading_periods").delete().eq("id", third[0].id).select("id"));
  const { data: gone } = await as.dirA.from("grading_periods").delete().eq("id", third[0].id).select("id");
  check(label("the director deletes the third period"), gone?.length === 1);
  must(await as.dirA.from("grading_periods").update({ end_date: "2071-06-30" }).eq("id", s2.id).select("id"), "restore S2");

  // --- Lock -------------------------------------------------------------------------------------------------
  await denied(label("a surveillant cannot lock a semester"),
    as.survA.from("grading_periods").update({ locked_at: new Date().toISOString() }).eq("id", s1.id).select("id"));
  const before = Date.now();
  const { data: locked, error: lockError } = await as.dirA.from("grading_periods")
    .update({ locked_at: "2000-01-01T00:00:00Z" }).eq("id", s1.id).select("locked_at, locked_by");
  check(label("the director locks S1 (time from the server, who recorded)"),
    !lockError && locked?.[0]?.locked_by === fx.users.dirA.id && Date.parse(locked[0].locked_at) > before - 60_000,
    lockError?.code ?? JSON.stringify(locked));
  const { error: frozen } = await as.dirA.from("grading_periods").update({ weight: 3 }).eq("id", s1.id).select("id");
  check(label("a locked semester's weight cannot change"), frozen?.message === "grading_period_locked", frozen?.message ?? "accepted!");
  const { error: frozenDates } = await as.dirA.from("grading_periods").update({ end_date: "2071-01-30" }).eq("id", s1.id).select("id");
  check(label("…nor its dates"), frozenDates?.message === "grading_period_locked", frozenDates?.message ?? "accepted!");
  await denied(label("a locked semester cannot be deleted"), as.dirA.from("grading_periods").delete().eq("id", s1.id).select("id"));
  const { data: relocked } = await as.dirA.from("grading_periods")
    .update({ locked_at: "2001-01-01T00:00:00Z" }).eq("id", s1.id).select("locked_at");
  check(label("locking again keeps the first lock time"), relocked?.[0]?.locked_at === locked?.[0]?.locked_at,
    JSON.stringify(relocked));
  const { data: unlocked } = await as.dirA.from("grading_periods").update({ locked_at: null }).eq("id", s1.id).select("locked_at, locked_by");
  check(label("the director unlocks it (who cleared)"),
    unlocked?.length === 1 && unlocked[0].locked_at === null && unlocked[0].locked_by === null, JSON.stringify(unlocked));

  // --- The year's dates move → the first / last period follow ----------------------------------------------
  must(await admin.from("academic_years").update({ start_date: "2070-09-05", end_date: "2071-06-25" }).eq("id", yearA), "move year");
  const moved = await periods(yearA);
  check(label("moving the year moves S1's start and S2's end"),
    moved[0].start_date === "2070-09-05" && moved[0].end_date === "2071-01-31"
      && moved[1].start_date === "2071-02-01" && moved[1].end_date === "2071-06-25",
    JSON.stringify(moved.map((p) => [p.start_date, p.end_date])));
  const { error: shrink } = await admin.from("academic_years").update({ end_date: "2071-01-15" }).eq("id", yearA);
  check(label("a year shortened past S2's start is refused"), shrink?.code === "23514", shrink?.code ?? "accepted!");
  must(await admin.from("academic_years").update({ start_date: "2070-09-01", end_date: "2071-06-30" }).eq("id", yearA), "restore year");

  // --- grade_level_settings ---------------------------------------------------------------------------------
  const settings = (client, values) => client.from("grade_level_settings")
    .insert({ school_id: A.id, academic_year_id: yearA, level_id: college, scale: 20, controls_count: 3, activities: true, ...values })
    .select("*");
  await denied(label("a surveillant cannot set a level's rules"), settings(as.survA, {}));
  await denied(label("a teacher cannot set a level's rules"), settings(as.tchA, {}));
  const { error: badScale } = await settings(as.dirA, { scale: 15 });
  check(label("refused: scale /15"), badScale?.code === "23514", badScale?.code ?? "accepted!");
  const { error: badControls } = await settings(as.dirA, { controls_count: 0 });
  check(label("refused: 0 contrôles"), badControls?.code === "23514", badControls?.code ?? "accepted!");
  const { error: tooMany } = await settings(as.dirA, { controls_count: 11 });
  check(label("refused: 11 contrôles"), tooMany?.code === "23514", tooMany?.code ?? "accepted!");
  const { data: ruleRow, error: ruleError } = await settings(as.dirA, {});
  check(label("the director sets 3AC: /20, 3 contrôles, activités (who recorded)"),
    !ruleError && ruleRow?.length === 1 && ruleRow[0].updated_by === fx.users.dirA.id, ruleError?.code ?? JSON.stringify(ruleRow));
  const { error: crossLevel } = await as.dirA.from("grade_level_settings")
    .insert({ school_id: A.id, academic_year_id: yearA, level_id: levelB, scale: 20 }).select("*");
  check(label("the director of A cannot set rules for B's level"), !!crossLevel, crossLevel?.code ?? "accepted!");
  await denied(label("a surveillant cannot change a level's rules"),
    as.survA.from("grade_level_settings").update({ scale: 10 }).eq("level_id", college).select("level_id"));
  await denied(label("the director of B cannot change A's rules"),
    as.dirB.from("grade_level_settings").update({ scale: 10 }).eq("level_id", college).select("level_id"));
  await rows(label("a teacher reads A's level rules"), as.tchA.from("grade_level_settings").select("level_id").eq("level_id", college), 1);
  await rows(label("the director of B reads none of A's level rules"), as.dirB.from("grade_level_settings").select("level_id"),
    (list) => list.every((r) => r.level_id !== college));

  const { data: effective, error: effectiveError } = await as.tchA.rpc("grade_level_rules", { p_year: yearA });
  const byLevel = Object.fromEntries((effective ?? []).map((r) => [r.level_id, r]));
  check(label("grade_level_rules: primaire defaults to /10, 4 contrôles, no activités"),
    !effectiveError && byLevel[primaire]?.scale === 10 && byLevel[primaire].controls_count === 4
      && byLevel[primaire].activities === false && byLevel[primaire].customised === false,
    effectiveError?.code ?? JSON.stringify(byLevel[primaire]));
  check(label("grade_level_rules: 3AC returns the saved rules"),
    byLevel[college]?.scale === 20 && byLevel[college].controls_count === 3 && byLevel[college].activities === true
      && byLevel[college].customised === true, JSON.stringify(byLevel[college]));
  const { data: effectiveB } = await as.dirB.rpc("grade_level_rules", { p_year: yearA });
  check(label("grade_level_rules as B's director: no level of A"),
    (effectiveB ?? []).every((r) => r.level_id !== college && r.level_id !== primaire), `${effectiveB?.length} row(s)`);
  const { data: effectiveAnon, error: anonRpc } = await as.anon.rpc("grade_level_rules", { p_year: yearA });
  check(label("grade_level_rules signed out: refused"), !!anonRpc || (effectiveAnon ?? []).length === 0,
    anonRpc?.code ?? `${effectiveAnon?.length} row(s)`);
  const { data: reset } = await as.dirA.from("grade_level_settings").delete().eq("level_id", college).select("level_id");
  check(label("the director deletes a level's rules (back to defaults)"), reset?.length === 1);

  // --- subject_coefficients ---------------------------------------------------------------------------------
  const coef = (client, values) => client.from("subject_coefficients")
    .insert({ school_id: A.id, academic_year_id: yearA, level_id: college, subject_id: subject, coefficient: 2, ...values })
    .select("*");
  await denied(label("a surveillant cannot add a coefficient"), coef(as.survA, {}));
  await denied(label("a teacher cannot add a coefficient"), coef(as.tchA, {}));
  const { data: common, error: commonError } = await coef(as.dirA, {});
  check(label("the director adds 3AC Maths coefficient 2 (common to the level)"),
    !commonError && common?.length === 1 && common[0].track_id === null && common[0].updated_by === fx.users.dirA.id,
    commonError?.code ?? JSON.stringify(common));
  const { error: twice } = await coef(as.dirA, { coefficient: 3 });
  check(label("refused: the same subject twice for the level (no filière)"), twice?.code === "23505", twice?.code ?? "accepted!");
  const { data: forTrack, error: trackError } = await coef(as.dirA, { track_id: track, coefficient: 4, controls_count: 2 });
  check(label("the director adds a filière's own coefficient + 2 contrôles"), !trackError && forTrack?.length === 1,
    trackError?.code ?? JSON.stringify(forTrack));
  const { error: twiceTrack } = await coef(as.dirA, { track_id: track });
  check(label("refused: the same subject twice for the filière"), twiceTrack?.code === "23505", twiceTrack?.code ?? "accepted!");
  const { error: wrongTrack } = await coef(as.dirA, { track_id: otherTrack });
  check(label("refused: a filière of another level"), wrongTrack?.code === "23503", wrongTrack?.code ?? "accepted!");
  for (const [name, values] of [["coefficient 0", { coefficient: 0 }], ["coefficient 25", { coefficient: 25 }],
    ["11 contrôles", { controls_count: 11 }], ["position 101", { position: 101 }]]) {
    const { error } = await coef(as.dirA, { track_id: null, subject_id: subject, level_id: primaire, ...values });
    check(label(`refused: ${name}`), error?.code === "23514", error?.code ?? "accepted!");
  }
  const { error: crossSubject } = await coef(as.dirA, { level_id: primaire, subject_id: subjectB });
  check(label("refused: B's subject on A's level"), !!crossSubject, crossSubject?.code ?? "accepted!");
  await denied(label("a surveillant cannot change a coefficient"),
    as.survA.from("subject_coefficients").update({ coefficient: 5 }).eq("id", common[0].id).select("id"));
  await denied(label("the director of B cannot change A's coefficient"),
    as.dirB.from("subject_coefficients").update({ coefficient: 5 }).eq("id", common[0].id).select("id"));
  await denied(label("the director cannot move a coefficient to another level"),
    as.dirA.from("subject_coefficients").update({ level_id: primaire }).eq("id", common[0].id).select("id"));
  const { data: changed } = await as.dirA.from("subject_coefficients").update({ coefficient: 1.5 }).eq("id", common[0].id).select("coefficient");
  check(label("the director changes the coefficient to 1.5"), Number(changed?.[0]?.coefficient) === 1.5, JSON.stringify(changed));
  await rows(label("a teacher reads A's coefficients"), as.tchA.from("subject_coefficients").select("id").eq("academic_year_id", yearA), 2);
  await rows(label("a parent reads A's coefficients"), parA.from("subject_coefficients").select("id").eq("academic_year_id", yearA), 2);
  await rows(label("the director of B reads none of A's coefficients"),
    as.dirB.from("subject_coefficients").select("id").eq("academic_year_id", yearA), 0);
  await denied(label("the director of B cannot delete A's coefficient"),
    as.dirB.from("subject_coefficients").delete().eq("id", common[0].id).select("id"));
  const { data: removed } = await as.dirA.from("subject_coefficients").delete().eq("id", forTrack[0].id).select("id");
  check(label("the director deletes the filière's coefficient"), removed?.length === 1);

  // --- Deleting the year takes its setup with it ------------------------------------------------------------
  must(await admin.from("grade_level_settings").insert({ school_id: A.id, academic_year_id: yearA, level_id: primaire, scale: 10 }), "rules again");
  must(await admin.from("academic_years").delete().eq("id", yearA), "year delete");
  const left = await Promise.all(["grading_periods", "grade_level_settings", "subject_coefficients"].map(async (t) =>
    (await admin.from(t).select("*", { count: "exact", head: true }).eq("academic_year_id", yearA)).count));
  check(label("deleting a year deletes its semesters, level rules and coefficients"), left.every((n) => n === 0), left.join(", "));

  must(await admin.from("academic_years").delete().eq("id", yearB), "year B delete");
  await admin.from("subjects").delete().in("id", [subject, subjectB]);
  await admin.from("levels").delete().in("id", [college, primaire, levelB]);
}
