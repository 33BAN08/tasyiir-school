// Phase 11 closing pass: school B's grading stays school B's. B has a year with
// rules, coefficients, marks, a class-council remark and a published, locked
// semester (cards + a parent notification), while a parent, a teacher, a
// surveillant and the director of school A listen on Realtime. They receive
// none of it, read none of it (semesters, rules, coefficients, marks, council
// remarks, publications, cards, notifications), get nothing from the
// functions (averages, entry progress, rules) and cannot change, unlock,
// save, publish, withdraw or copy any of it. B's own parent does receive the
// notification and reads the card (control).
import { randomBytes } from "node:crypto";

import { check } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";
import { randomMobile } from "./phase5-guardians.mjs";

export async function phase11CrossSchool({ fx, as }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const label = (s) => `[P11 cross-school] ${s}`;
  const must = (r, what) => {
    if (r.error) throw new Error(`phase11CrossSchool setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (query, what) => must(await query.select("id").single(), what).id;
  const account = async (name, school, roleId) => {
    const email = `rls-test+${fx.run}-${name}@example.com`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), name).user;
    fx.createdUserIds.push(user.id);
    must(await admin.from("profiles").insert({ id: user.id, school_id: school.id, role_id: roleId, full_name: `RLS ${name}`, must_change_password: false }), name);
    return { id: user.id, client: await signIn({ email, password }) };
  };
  const cleanup = [];

  try {
    // --- School B: a year, rules, a coefficient, a class of two, a parent account ----------------------
    const year = await id(admin.from("academic_years").insert({ school_id: B.id, label: `x11-${fx.run}`, start_date: "2096-09-01", end_date: "2097-06-30", is_current: false }), "year");
    cleanup.unshift(() => admin.from("academic_years").delete().eq("id", year));
    const level = await id(admin.from("levels").insert({ school_id: B.id, name: `X11-${fx.run}`, cycle: "college" }), "level");
    cleanup.unshift(() => admin.from("levels").delete().eq("id", level));
    const subject = await id(admin.from("subjects").insert({ school_id: B.id, name: `X11-${fx.run}` }), "subject");
    cleanup.unshift(() => admin.from("subjects").delete().eq("id", subject));
    must(await admin.from("grade_level_settings").insert({ school_id: B.id, academic_year_id: year, level_id: level, scale: 20, controls_count: 2, activities: false }), "rules");
    cleanup.unshift(() => admin.from("grade_level_settings").delete().eq("academic_year_id", year));
    const coef = await id(admin.from("subject_coefficients").insert({ school_id: B.id, academic_year_id: year, level_id: level, subject_id: subject, coefficient: 3 }), "coef");
    cleanup.unshift(() => admin.from("subject_coefficients").delete().eq("academic_year_id", year));
    const klass = await id(admin.from("classes").insert({ school_id: B.id, academic_year_id: year, level_id: level, name: `X11-${fx.run}` }), "class");
    cleanup.unshift(() => admin.from("classes").delete().eq("id", klass));
    const kids = [];
    for (const n of [1, 2]) {
      const kid = await id(admin.from("students").insert({ school_id: B.id, first_name: `Kid${n}`, last_name: `X11B ${fx.run}`, birth_date: "2012-01-01", gender: "male" }), "kid");
      cleanup.unshift(() => admin.from("students").delete().eq("id", kid));
      must(await admin.from("student_enrollments").insert({ school_id: B.id, student_id: kid, academic_year_id: year, class_id: klass }), "enrol");
      kids.push(kid);
    }
    const parB = await account("x11parb", B, B.roles.parent);
    const guardian = await id(admin.from("guardians").insert({ school_id: B.id, last_name: "X11B", first_name: "Parent", phone: randomMobile(), profile_id: parB.id }), "guardian");
    cleanup.unshift(() => admin.from("guardians").delete().eq("id", guardian));
    must(await admin.from("student_guardians").insert({ school_id: B.id, student_id: kids[0], guardian_id: guardian, relation: "father" }), "link");
    const [S1] = must(await admin.from("grading_periods").select("id").eq("academic_year_id", year).order("number"), "periods");
    must(await admin.from("grades").insert(kids.flatMap((kid, i) => [1, 2].map((number) =>
      ({ school_id: B.id, period_id: S1.id, student_id: kid, subject_id: subject, kind: "control", number, score: 12 + i + number, absent: false })))), "marks");
    cleanup.unshift(() => admin.from("grades").delete().in("student_id", kids));
    must(await as.dirB.rpc("save_council_remarks", { p_class: klass, p_period: S1.id, p_cells: [{ student_id: kids[0], body: "Bon trimestre" }] }), "council remark");
    cleanup.unshift(() => admin.from("council_remarks").delete().eq("class_id", klass));
    must(await admin.from("grading_periods").update({ locked_at: new Date().toISOString() }).eq("id", S1.id), "lock");
    cleanup.unshift(() => admin.from("grading_periods").update({ locked_at: null }).eq("academic_year_id", year));
    cleanup.unshift(() => admin.from("grade_publications").delete().eq("class_id", klass));
    cleanup.unshift(() => admin.from("notifications").delete().eq("school_id", B.id).eq("type", "grades_published").in("student_id", kids));

    // --- Observers in school A, and B's parent as the control; everyone listens ------------------------
    const parA = await account("x11para", A, A.roles.parent);
    const observers = [
      ["a parent of A", parA.client], ["a teacher of A", as.tchA], ["a surveillant of A", as.survA], ["the director of A", as.dirA],
    ];
    const listen = (client, bucket) =>
      new Promise((resolve) => {
        const channel = client.channel(`x11-${randomBytes(4).toString("hex")}`)
          .on("system", {}, (m) => { if (m.extension === "postgres_changes" && m.status === "ok") resolve(channel); })
          .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, (m) => bucket.push(m.new ?? m.old));
        channel.subscribe((status) => { if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") resolve(null); });
        setTimeout(() => resolve(null), 10_000);
      });
    const heard = observers.map(() => []);
    const heardB = [];
    const channels = await Promise.all([...observers.map(([, client], i) => listen(client, heard[i])), listen(parB.client, heardB)]);
    check(label("every listener subscribed"), channels.every(Boolean));

    // --- B publishes the semester ----------------------------------------------------------------------
    must(await as.dirB.rpc("publish_grades", { p_class: klass, p_period: S1.id, p_show_rank: true }), "publish");
    const pub = must(await admin.from("grade_publications").select("id").eq("class_id", klass).single(), "publication").id;
    await new Promise((r) => setTimeout(r, 4000));
    for (const [i, ch] of channels.entries()) if (ch) await [...observers.map(([, c]) => c), parB.client][i].removeChannel(ch);

    check(label("control: B's parent hears the grades notification on Realtime"), heardB.some((n) => n?.type === "grades_published"));
    const cardsB = (await parB.client.from("report_cards").select("id, student_id")).data ?? [];
    check(label("control: B's parent reads their child's card, only that one"), cardsB.length === 1 && cardsB[0].student_id === kids[0]);

    // --- What A's accounts see -------------------------------------------------------------------------
    const none = async (client, table, column, value) => ((await client.from(table).select(column).eq(column, value)).data ?? []).length === 0;
    for (const [i, [who, client]] of observers.entries()) {
      check(label(`${who} hears nothing on Realtime`), heard[i].length === 0, `${heard[i].length} event(s)`);
      check(label(`${who} reads none of B's semesters`), await none(client, "grading_periods", "academic_year_id", year));
      check(label(`${who} reads none of B's level rules`), await none(client, "grade_level_settings", "academic_year_id", year));
      check(label(`${who} reads none of B's coefficients`), await none(client, "subject_coefficients", "academic_year_id", year));
      check(label(`${who} reads none of B's marks`), await none(client, "grades", "period_id", S1.id));
      check(label(`${who} reads no council remark of B`), await none(client, "council_remarks", "class_id", klass));
      check(label(`${who} reads no publication of B`), await none(client, "grade_publications", "class_id", klass));
      check(label(`${who} reads no card of B`), await none(client, "report_cards", "publication_id", pub));
      check(label(`${who} reads no notification of B`), await none(client, "notifications", "school_id", B.id));

      const avg = await client.rpc("class_averages", { p_class: klass });
      check(label(`${who}: class_averages of B's class refused`), !!avg.error && (avg.data ?? []).length === 0, avg.error?.message ?? "accepted!");
      const progress = await client.rpc("grade_entry_progress", { p_period: S1.id });
      check(label(`${who}: grade_entry_progress of B's semester gives no row`), (progress.data ?? []).length === 0);
      const rules = await client.rpc("grade_level_rules", { p_year: year });
      check(label(`${who}: grade_level_rules of B's year gives none of B's levels`), !(rules.data ?? []).some((r) => r.level_id === level));

      const refusals = {
        save_grades: client.rpc("save_grades", { p_period: S1.id, p_subject: subject, p_cells: [{ student_id: kids[0], kind: "control", number: 1, score: 1, absent: false }] }),
        save_council_remarks: client.rpc("save_council_remarks", { p_class: klass, p_period: S1.id, p_cells: [{ student_id: kids[0], body: "Pirate" }] }),
        save_subject_coefficients: client.rpc("save_subject_coefficients", { p_year: year, p_cells: [{ level_id: level, track_id: null, subject_id: subject, coefficient: 9, controls_count: null, position: 0 }] }),
        publish_grades: client.rpc("publish_grades", { p_class: klass, p_period: S1.id, p_show_rank: false }),
        unpublish_grades: client.rpc("unpublish_grades", { p_publication: pub }),
        copy_grading_from_year: client.rpc("copy_grading_from_year", { p_from_year: year, p_to_year: year, p_apply: true }),
      };
      for (const [fn, call] of Object.entries(refusals)) {
        const { error } = await call;
        check(label(`${who}: ${fn} on B's data refused`), !!error, "accepted!");
      }

      await client.from("grades").update({ score: 0 }).eq("period_id", S1.id);
      await client.from("grades").delete().eq("period_id", S1.id);
      await client.from("grading_periods").update({ locked_at: null }).eq("id", S1.id);
      await client.from("subject_coefficients").update({ coefficient: 9 }).eq("id", coef);
      await client.from("subject_coefficients").delete().eq("id", coef);
      await client.from("grade_level_settings").update({ scale: 10 }).eq("academic_year_id", year);
      await client.from("council_remarks").update({ body: "Pirate" }).eq("class_id", klass);
      await client.from("council_remarks").delete().eq("class_id", klass);
      await client.from("report_cards").delete().eq("publication_id", pub);
      await client.from("notifications").update({ read_at: new Date().toISOString() }).eq("school_id", B.id);
    }

    // --- B's data is exactly as it was --------------------------------------------------------------------
    const marks = must(await admin.from("grades").select("score").eq("period_id", S1.id), "marks after");
    check(label("B's 4 marks unchanged"), marks.length === 4 && marks.every((m) => Number(m.score) >= 13));
    const period = must(await admin.from("grading_periods").select("locked_at").eq("id", S1.id).single(), "period after");
    check(label("B's semester still locked"), !!period.locked_at);
    const c = must(await admin.from("subject_coefficients").select("coefficient").eq("id", coef), "coef after");
    check(label("B's coefficient unchanged"), c.length === 1 && Number(c[0].coefficient) === 3);
    const r = must(await admin.from("grade_level_settings").select("scale").eq("academic_year_id", year).single(), "rules after");
    check(label("B's level rules unchanged"), r.scale === 20);
    const cr = must(await admin.from("council_remarks").select("body").eq("class_id", klass), "council after");
    check(label("B's council remark unchanged"), cr.length === 1 && cr[0].body === "Bon trimestre");
    const cards = must(await admin.from("report_cards").select("id, council_remark").eq("publication_id", pub), "cards after");
    check(label("B's 2 cards still there, council remark copied in"), cards.length === 2 && cards.some((k) => k.council_remark === "Bon trimestre"));
    const notes = must(await admin.from("notifications").select("read_at, school_id").eq("recipient_id", parB.id).eq("type", "grades_published"), "notes after");
    check(label("B's parent's notification unread, in school B"), notes.length === 1 && !notes[0].read_at && notes[0].school_id === B.id);
  } finally {
    for (const step of cleanup) await step();
  }
}
