// Phase 11 step 7: publish_grades / unpublish_grades, report cards and what
// parents may read. Snapshot = class_averages() at publish time; a semester
// must be locked (the year: all of them); publishing again replaces the cards
// and the notification; parents read only their own children's cards, never
// `grades`; the rank can be left out; push follows the parent's "grades"
// switch; school B and school A never see each other's cards.
import { randomBytes } from "node:crypto";

import { check } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";
import { createGradesFixture } from "./grades-fixture.mjs";
import { randomMobile } from "./phase5-guardians.mjs";

export async function phase11Publish({ fx, as }) {
  const label = (s) => `[P11 publish] ${s}`;
  const f = await createGradesFixture(fx, "p11pb");
  const A = f.A;
  const B = fx.schools.b;
  const { maths, hist } = f.subjects;
  const { a1, a2, a3 } = f.students;
  const { cA } = f.classes;
  const [S1, S2] = f.periods;
  const must = (r, what) => {
    if (r.error) throw new Error(`publish fixture: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const lock = (ids, on) => admin.from("grading_periods").update({ locked_at: on ? new Date().toISOString() : null }).in("id", ids);
  const publish = (client, period, showRank = true, klass = cA) =>
    client.rpc("publish_grades", { p_class: klass, p_period: period, p_show_rank: showRank });
  const refused = async (name, call, wanted) => {
    const { error } = await call;
    check(label(name), !!error && (error.code === wanted || error.message?.includes(wanted)), error ? `${error.code} ${error.message}` : "accepted!");
  };
  const cards = async (client, student) => {
    let q = client.from("report_cards").select("id, student_id, publication_id, average, rank, ranked, missing, subjects, periods");
    if (student) q = q.eq("student_id", student);
    return (await q).data ?? [];
  };
  const notices = async () => (await admin.from("notifications").select("id, data, student_id")
    .eq("recipient_id", f.parent.id).eq("type", "grades_published")).data ?? [];
  const grade = (student, period, subject, number, score, kind = "control") =>
    ({ school_id: A.id, period_id: period, student_id: student, subject_id: subject, kind, number, score, absent: false });
  const bClean = [];
  let endpoint = null;

  try {
    must(await admin.from("grades").insert([
      grade(a1, S1.id, maths, 1, 14), grade(a1, S1.id, maths, 1, 16, "activities"), grade(a1, S1.id, hist, 1, 12),
      grade(a2, S1.id, maths, 1, 10), grade(a2, S1.id, hist, 1, 11), grade(a3, S1.id, maths, 1, 18),
      grade(a1, S2.id, maths, 1, 17), grade(a1, S2.id, hist, 1, 13),
    ]), "grades");
    must(await lock([S1.id, S2.id], false), "unlock");

    // --- Publishing a semester ---------------------------------------------------------------------
    await refused("an unlocked semester cannot be published", publish(as.dirA, S1.id), "publish_period_not_locked");
    must(await lock([S1.id], true), "lock S1");
    await refused("the surveillant (grades.view) cannot publish", publish(as.survA, S1.id), "publish_forbidden");
    await refused("a teacher cannot publish", publish(as.tchA, S1.id), "publish_forbidden");
    await refused("a parent cannot publish", publish(f.parent.client, S1.id), "publish_forbidden");
    await refused("the director of B cannot publish A's class", publish(as.dirB, S1.id), "publish_class_not_found");
    await refused("a semester of another year is refused", publish(as.dirA, f.pastPeriods[0].id), "publish_period_not_found");
    const { data: n, error } = await publish(as.dirA, S1.id);
    check(label("the director publishes S1 of class A: one card per student"), !error && n === 3, error?.message ?? String(n));

    const { data: avg } = await as.dirA.rpc("class_averages", { p_class: cA });
    const general = (s) => avg.find((r) => r.student_id === s && r.period_id === S1.id && r.subject_id === null);
    const all = await cards(as.dirA);
    const c1 = all.find((c) => c.student_id === a1);
    check(label("the card holds class_averages()' numbers: general average, rank, ranked"),
      Number(c1?.average) === Number(general(a1).average) && c1?.rank === general(a1).rank && c1?.ranked === 3, JSON.stringify(c1 && { a: c1.average, r: c1.rank }));
    const m = c1?.subjects.find((s) => s.subject_id === maths);
    check(label("…subjects with name, coefficient, average (14 + activités 16) / 2 = 15 and the marks"),
      Number(m?.average) === 15 && Number(m?.coefficient) === 1 && m?.name?.startsWith("p11pb-Maths") && m?.marks?.length === 2
        && m.marks[0].kind === "control" && Number(m.marks[0].score) === 14, JSON.stringify(m));
    check(label("…in report card order (Maths position 1, HG 2)"), c1?.subjects.map((s) => s.subject_id).join() === `${maths},${hist}`);

    let list = await notices();
    check(label("the parent is notified once: period 1, not a republication"),
      list.length === 1 && list[0].student_id === a1 && list[0].data.period_number === 1 && list[0].data.republished === false, JSON.stringify(list));

    // --- Who reads ------------------------------------------------------------------------------------
    const mine = await cards(f.parent.client);
    check(label("the parent reads their child's card and no other"), mine.length === 1 && mine[0].student_id === a1, String(mine.length));
    const { data: pubs } = await f.parent.client.from("grade_publications").select("id, period_id, show_rank");
    check(label("…and that publication"), (pubs ?? []).length === 1 && pubs[0].period_id === S1.id);
    const { data: stillNone } = await f.parent.client.from("grades").select("id").eq("student_id", a1);
    check(label("…still no row of `grades`"), (stillNone ?? []).length === 0);
    check(label("the surveillant reads the 3 cards"), (await cards(as.survA)).length === 3);
    check(label("a teacher reads no card"), (await cards(as.tchA)).length === 0);
    check(label("an office manager reads no card"), (await cards(as.mgrA)).length === 0);
    check(label("the director of B reads none of A's cards"), (await cards(as.dirB)).length === 0);
    const { error: insErr } = await as.dirA.from("report_cards").insert({ school_id: A.id, publication_id: c1.publication_id, student_id: a2, scale: 20 });
    const { error: updErr } = await as.dirA.from("report_cards").update({ average: 20 }).eq("id", c1.id).select("id");
    const { error: delErr } = await as.dirA.from("report_cards").delete().eq("id", c1.id).select("id");
    check(label("nobody writes cards directly (insert / update / delete refused)"),
      !!insErr && !!updErr && !!delErr && (await cards(as.dirA)).length === 3, `${insErr?.code} ${updErr?.code} ${delErr?.code}`);

    // --- The snapshot does not move; publishing again replaces it -----------------------------------
    must(await lock([S1.id], false), "unlock S1");
    must(await admin.from("grades").update({ score: 4 }).eq("period_id", S1.id).eq("student_id", a1).eq("subject_id", maths).eq("kind", "control"), "change");
    const frozen = (await cards(f.parent.client))[0];
    check(label("a grade changed after publishing: the parent's card does not move"), Number(frozen?.average) === Number(c1.average));
    await refused("…and S1 cannot be published while unlocked", publish(as.dirA, S1.id), "publish_period_not_locked");
    must(await lock([S1.id], true), "relock S1");
    const { error: again } = await publish(as.dirA, S1.id, false);
    const after = await cards(as.dirA);
    const c1b = after.find((c) => c.student_id === a1);
    check(label("publishing again (rank hidden): same publication, new numbers, no rank anywhere"),
      !again && after.length === 3 && c1b?.publication_id === c1.publication_id && Number(c1b?.subjects[0].average) === 10
        && after.every((c) => c.rank === null && c.ranked === null && c.subjects.every((s) => s.rank === null)), again?.message ?? JSON.stringify(c1b?.subjects[0]));
    list = await notices();
    check(label("…the parent's notification is replaced (one, republished)"), list.length === 1 && list[0].data.republished === true, JSON.stringify(list));

    // --- The year --------------------------------------------------------------------------------------
    await refused("the year needs every semester locked", publish(as.dirA, null), "publish_periods_not_locked");
    must(await lock([S2.id], true), "lock S2");
    const { error: yErr } = await publish(as.dirA, null);
    const year = (await cards(f.parent.client)).find((c) => c.periods.length > 0);
    const ym = year?.subjects.find((s) => s.subject_id === maths);
    check(label("the year card: each semester's general average and each subject's semester averages"),
      !yErr && year?.periods.length === 2 && year.periods[0].number === 1 && ym?.periods?.length === 2 && ym.marks.length === 0,
      yErr?.message ?? JSON.stringify(year?.periods));
    list = await notices();
    check(label("…the parent now has 2 notifications, the year's without a period number"),
      list.length === 2 && list.some((x) => x.data.period_number === null));

    // --- Push follows the parent's "grades" switch ----------------------------------------------------
    endpoint = `https://push.example.invalid/${fx.run}-${randomBytes(4).toString("hex")}`;
    must(await admin.from("push_subscriptions").insert({ school_id: A.id, profile_id: f.parent.id, endpoint, p256dh: "k", auth: "a" }), "subscription");
    const { error: prefErr } = await f.parent.client.rpc("save_push_preferences", { p_absences: true, p_remarks: true, p_announcements: true, p_grades: false });
    const { error: prefOld } = await f.parent.client.rpc("save_push_preferences", { p_absences: true, p_remarks: false, p_announcements: true });
    const { data: pref } = await f.parent.client.from("push_preferences").select("grades, remarks").single();
    check(label("the parent switches grades pushes off; the 3-switch call keeps it off"),
      !prefErr && !prefOld && pref?.grades === false && pref?.remarks === false, prefErr?.message ?? prefOld?.message ?? JSON.stringify(pref));
    const outbox = async () => {
      const ids = (await notices()).map((x) => x.id);
      return ids.length ? (await admin.from("push_outbox").select("id").in("notification_id", ids)).data?.length ?? 0 : 0;
    };
    await publish(as.dirA, S1.id);
    check(label("…publishing queues no push for them"), (await outbox()) === 0);
    await f.parent.client.rpc("save_push_preferences", { p_absences: true, p_remarks: true, p_announcements: true, p_grades: true });
    await publish(as.dirA, S1.id);
    check(label("switched back on: the new notification is queued for push"), (await outbox()) === 1);

    // --- Unpublishing ----------------------------------------------------------------------------------
    const s1pub = c1.publication_id;
    await refused("the surveillant cannot unpublish", as.survA.rpc("unpublish_grades", { p_publication: s1pub }), "publish_forbidden");
    await refused("the director of B cannot unpublish A's", as.dirB.rpc("unpublish_grades", { p_publication: s1pub }), "publish_not_found");
    const { error: unErr } = await as.dirA.rpc("unpublish_grades", { p_publication: s1pub });
    const left = await cards(f.parent.client);
    list = await notices();
    check(label("unpublished: the S1 card and its notification are gone, the year stays"),
      !unErr && left.length === 1 && left[0].periods.length === 2 && list.length === 1 && list[0].data.period_number === null, unErr?.message);
    await refused("unpublishing twice: not found", as.dirA.rpc("unpublish_grades", { p_publication: s1pub }), "publish_not_found");

    // --- Module off ------------------------------------------------------------------------------------
    await admin.from("school_modules").update({ enabled: false }).eq("school_id", A.id).eq("module_key", "grades");
    check(label("grades module off: the parent reads no card"), (await cards(f.parent.client)).length === 0);
    await refused("…and the director cannot publish", publish(as.dirA, null), "publish_forbidden");
    await admin.from("school_modules").update({ enabled: true }).eq("school_id", A.id).eq("module_key", "grades");

    // --- Cross-school: school B publishes its own class ----------------------------------------------
    const bid = async (q, what) => must(await q.select("id").single(), what).id;
    const yearB = await bid(admin.from("academic_years").insert({ school_id: B.id, label: `p11pb-${fx.run}`, start_date: "2093-09-01", end_date: "2094-06-30", is_current: false }), "B year");
    bClean.push(() => admin.from("academic_years").delete().eq("id", yearB));
    const levelB = await bid(admin.from("levels").insert({ school_id: B.id, name: `p11pb-B-${fx.run}`, cycle: "college" }), "B level");
    bClean.unshift(() => admin.from("levels").delete().eq("id", levelB));
    const subjectB = await bid(admin.from("subjects").insert({ school_id: B.id, name: `p11pb-B-${fx.run}` }), "B subject");
    bClean.unshift(() => admin.from("subjects").delete().eq("id", subjectB));
    must(await admin.from("subject_coefficients").insert({ school_id: B.id, academic_year_id: yearB, level_id: levelB, subject_id: subjectB, coefficient: 1 }), "B coef");
    const classB = await bid(admin.from("classes").insert({ school_id: B.id, academic_year_id: yearB, level_id: levelB, name: `p11pb-B-${fx.run}` }), "B class");
    bClean.unshift(() => admin.from("classes").delete().eq("id", classB));
    const kidB = await bid(admin.from("students").insert({ school_id: B.id, first_name: "Kid", last_name: `B ${fx.run}`, birth_date: "2012-01-01", gender: "male" }), "B kid");
    bClean.unshift(() => admin.from("students").delete().eq("id", kidB));
    must(await admin.from("student_enrollments").insert({ school_id: B.id, student_id: kidB, academic_year_id: yearB, class_id: classB }), "B enrol");
    const emailB = `rls-test+${fx.run}-p11pbparB@example.com`;
    const passwordB = `${randomBytes(12).toString("base64url")}a1`;
    const userB = must(await admin.auth.admin.createUser({ email: emailB, password: passwordB, email_confirm: true }), "B parent").user;
    fx.createdUserIds.push(userB.id);
    must(await admin.from("profiles").insert({ id: userB.id, school_id: B.id, role_id: B.roles.parent, full_name: "RLS parent B", must_change_password: false }), "B profile");
    const guardianB = await bid(admin.from("guardians").insert({ school_id: B.id, last_name: "B", first_name: "Parent", phone: randomMobile(), profile_id: userB.id }), "B guardian");
    bClean.unshift(() => admin.from("guardians").delete().eq("id", guardianB));
    must(await admin.from("student_guardians").insert({ school_id: B.id, student_id: kidB, guardian_id: guardianB, relation: "father" }), "B link");
    const periodsB = must(await admin.from("grading_periods").select("id").eq("academic_year_id", yearB).order("number"), "B periods");
    must(await admin.from("grades").insert({ school_id: B.id, period_id: periodsB[0].id, student_id: kidB, subject_id: subjectB, kind: "control", number: 1, score: 15, absent: false }), "B grade");
    bClean.unshift(() => admin.from("grading_periods").update({ locked_at: null }).eq("academic_year_id", yearB));
    must(await admin.from("grading_periods").update({ locked_at: new Date().toISOString() }).eq("id", periodsB[0].id), "B lock");
    const { error: bErr } = await publish(as.dirB, periodsB[0].id, true, classB);
    const parentB = await signIn({ email: emailB, password: passwordB });
    const bCards = await cards(parentB);
    check(label("school B publishes; B's parent reads their child's card (control)"),
      !bErr && bCards.length === 1 && Number(bCards[0].average) === 15, bErr?.message ?? String(bCards.length));
    check(label("A's parent, director, surveillant read none of B's cards"),
      (await cards(f.parent.client, kidB)).length === 0 && (await cards(as.dirA, kidB)).length === 0 && (await cards(as.survA, kidB)).length === 0);
    const { data: aPubsB } = await as.dirA.from("grade_publications").select("id").eq("class_id", classB);
    check(label("…nor B's publication"), (aPubsB ?? []).length === 0);
    check(label("B's parent reads none of A's cards"), (await cards(parentB, a1)).length === 0);
    const bPub = bCards[0]?.publication_id;
    await refused("A's director cannot unpublish B's", as.dirA.rpc("unpublish_grades", { p_publication: bPub }), "publish_not_found");
    await refused("A's director cannot publish B's class", publish(as.dirA, periodsB[0].id, true, classB), "publish_class_not_found");
    const { data: bNotes } = await admin.from("notifications").select("school_id").eq("recipient_id", userB.id).eq("type", "grades_published");
    check(label("B's parent got B's notification only"), (bNotes ?? []).length === 1 && bNotes[0].school_id === B.id);
  } finally {
    if (endpoint) await admin.from("push_subscriptions").delete().eq("endpoint", endpoint);
    await admin.from("push_preferences").delete().eq("profile_id", f.parent.id);
    await admin.from("school_modules").update({ enabled: true }).eq("school_id", A.id).eq("module_key", "grades");
    await lock([S1.id, S2.id], false);
    await admin.from("grade_publications").delete().eq("class_id", cA);
    await admin.from("grades").delete().in("student_id", Object.values(f.students));
    for (const step of bClean) await step();
    await f.cleanup();
  }
}
