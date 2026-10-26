// Phase 11 step 8: class-council remarks (save_council_remarks) and what the
// published card now holds for printing (council remark + the term's student
// remarks), always as a snapshot: changing a remark later changes no card
// until "Republier".
import { check } from "./checks.mjs";
import { admin } from "./fixtures.mjs";
import { createGradesFixture } from "./grades-fixture.mjs";

export async function phase11Council({ fx, as }) {
  const label = (s) => `[P11 council] ${s}`;
  const f = await createGradesFixture(fx, "p11cr");
  const A = f.A;
  const { a1, a2, a3, b1 } = f.students;
  const { cA } = f.classes;
  const today = new Date().toISOString().slice(0, 10);
  const { data: allPeriods } = await admin.from("grading_periods").select("id, start_date, end_date").eq("academic_year_id", f.year).order("number");
  // The semester holding today: the student remark written now belongs to it.
  const P = allPeriods.find((p) => p.start_date <= today && today <= p.end_date) ?? allPeriods[0];
  const other = allPeriods.find((p) => p.id !== P.id);
  const save = (client, cells, period = P.id, klass = cA) =>
    client.rpc("save_council_remarks", { p_class: klass, p_period: period, p_cells: cells });
  const rows = async () => (await admin.from("council_remarks").select("student_id, period_id, body, academic_year_id, updated_by").eq("class_id", cA)).data ?? [];
  const refused = async (name, call, wanted) => {
    const { error } = await call;
    check(label(name), !!error && (error.code === wanted || error.message?.includes(wanted)), error ? `${error.code} ${error.message}` : "accepted!");
  };
  const card = async (client, student, period = P.id) => {
    const { data: pub } = await admin.from("grade_publications").select("id").eq("class_id", cA)
      [period ? "eq" : "is"]("period_id", period ?? null).maybeSingle();
    if (!pub) return null;
    return (await client.from("report_cards").select("council_remark, remarks").eq("publication_id", pub.id).eq("student_id", student).maybeSingle()).data;
  };
  let remarkId = null;

  try {
    // --- Saving a sheet -------------------------------------------------------------------------------
    const { data: n, error } = await save(as.dirA, [
      { student_id: a1, body: "  Très bon semestre, continuez.  " }, { student_id: a2, body: "Peut mieux faire." }, { student_id: a3, body: "" },
    ]);
    let list = await rows();
    const r1 = list.find((r) => r.student_id === a1);
    check(label("the director saves the class's remarks in one call (empty = nothing)"),
      !error && n === 2 && list.length === 2 && r1?.body === "Très bon semestre, continuez." && r1.academic_year_id === f.year && r1.updated_by === fx.users.dirA.id,
      error?.message ?? JSON.stringify(list));
    await refused("a student of another class refuses the whole sheet", save(as.dirA, [{ student_id: a3, body: "Ok" }, { student_id: b1, body: "Non" }]), "council_remark_not_in_class");
    check(label("…nothing saved"), (await rows()).length === 2);
    const { error: e2 } = await save(as.dirA, [{ student_id: a2, body: "" }, { student_id: a1, body: "Excellent." }]);
    list = await rows();
    check(label("change + clear in one call"), !e2 && list.length === 1 && list[0].body === "Excellent.", e2?.message);
    await refused("501 characters refused", save(as.dirA, [{ student_id: a2, body: "x".repeat(501) }]), "council_remarks_body_check");
    await refused("more than 200 cells", save(as.dirA, Array.from({ length: 201 }, () => ({ student_id: a1, body: "x" }))), "council_remarks_too_many");
    const { error: yearErr } = await save(as.dirA, [{ student_id: a1, body: "Année réussie." }], null);
    check(label("a remark for the year (no semester) is separate"), !yearErr && (await rows()).length === 2, yearErr?.message);

    // --- Who ----------------------------------------------------------------------------------------
    await refused("the surveillant cannot write", save(as.survA, [{ student_id: a2, body: "Non" }]), "42501");
    const { data: survRead } = await as.survA.from("council_remarks").select("id").eq("class_id", cA);
    check(label("…but reads them"), (survRead ?? []).length === 2);
    await refused("a teacher cannot write", save(as.tchA, [{ student_id: a2, body: "Non" }]), "42501");
    const { data: tchRead } = await as.tchA.from("council_remarks").select("id").eq("class_id", cA);
    const { data: parRead } = await f.parent.client.from("council_remarks").select("id");
    check(label("a teacher and a parent read none"), (tchRead ?? []).length === 0 && (parRead ?? []).length === 0);
    await refused("a parent cannot write", save(f.parent.client, [{ student_id: a1, body: "Non" }]), "42501");
    await refused("the director of B cannot write into A's class", save(as.dirB, [{ student_id: a1, body: "Non" }]), "council_remark_class_not_found");
    const { data: bRead } = await as.dirB.from("council_remarks").select("id").eq("class_id", cA);
    check(label("…nor read A's"), (bRead ?? []).length === 0);
    const { error: direct } = await as.dirA.from("council_remarks").update({ student_id: a2 }).eq("class_id", cA).select("id");
    check(label("who / which class a remark is for never changes (only the text)"), !!direct, "accepted!");

    // --- Locked semester: still writable; the card copies it -----------------------------------------
    await admin.from("grading_periods").update({ locked_at: new Date().toISOString() }).in("id", allPeriods.map((p) => p.id));
    const { error: lockedErr } = await save(as.dirA, [{ student_id: a1, body: "Excellent travail." }]);
    check(label("the semester is locked: the council remark can still be written"), !lockedErr, lockedErr?.message);
    const { data: remark, error: remErr } = await as.dirA.from("student_remarks").insert({ school_id: A.id, student_id: a1, type: "praise", body: "Bravo pour l'exposé." }).select("id").single();
    if (remErr) throw new Error(`student remark: ${remErr.message}`);
    remarkId = remark.id;
    const { error: pubErr } = await as.dirA.rpc("publish_grades", { p_class: cA, p_period: P.id, p_show_rank: true });
    let c = await card(as.dirA, a1);
    check(label("publishing copies the council remark and the term's student remarks into the card"),
      !pubErr && c?.council_remark === "Excellent travail." && c.remarks.length === 1 && c.remarks[0].type === "praise"
        && c.remarks[0].body === "Bravo pour l'exposé." && c.remarks[0].date === today, pubErr?.message ?? JSON.stringify(c));
    const c2 = await card(as.dirA, a2);
    check(label("…a student without remarks: none"), c2?.council_remark === null && c2?.remarks.length === 0);
    const parentCard = await card(f.parent.client, a1);
    check(label("the parent reads both on their child's card"), parentCard?.council_remark === "Excellent travail." && parentCard.remarks.length === 1);

    await save(as.dirA, [{ student_id: a1, body: "Changé après la publication." }]);
    await admin.from("student_remarks").delete().eq("id", remarkId);
    c = await card(as.dirA, a1);
    check(label("changed / deleted afterwards: the published card does not move"), c?.council_remark === "Excellent travail." && c.remarks.length === 1);
    await as.dirA.rpc("publish_grades", { p_class: cA, p_period: P.id, p_show_rank: true });
    c = await card(as.dirA, a1);
    check(label("…Republier picks the new ones up"), c?.council_remark === "Changé après la publication." && c.remarks.length === 0);

    if (other) {
      const { error: oErr } = await as.dirA.rpc("publish_grades", { p_class: cA, p_period: other.id, p_show_rank: true });
      const oc = await card(as.dirA, a1, other.id);
      check(label("another semester's card has its own (no) council remark"), !oErr && oc?.council_remark === null, oErr?.message);
    }
    const { error: yErr } = await as.dirA.rpc("publish_grades", { p_class: cA, p_period: null, p_show_rank: true });
    const yc = await card(as.dirA, a1, null);
    check(label("the year card has the year's council remark"), !yErr && yc?.council_remark === "Année réussie.", yErr?.message ?? JSON.stringify(yc));

    await admin.from("school_modules").update({ enabled: false }).eq("school_id", A.id).eq("module_key", "grades");
    await refused("grades module off: refused", save(as.dirA, [{ student_id: a1, body: "Non" }]), "council_remarks_forbidden");
    await admin.from("school_modules").update({ enabled: true }).eq("school_id", A.id).eq("module_key", "grades");
  } finally {
    await admin.from("school_modules").update({ enabled: true }).eq("school_id", A.id).eq("module_key", "grades");
    if (remarkId) await admin.from("student_remarks").delete().eq("id", remarkId);
    await admin.from("grading_periods").update({ locked_at: null }).eq("academic_year_id", f.year);
    await admin.from("grade_publications").delete().eq("class_id", cA);
    await admin.from("council_remarks").delete().eq("class_id", cA);
    await admin.from("grades").delete().in("student_id", Object.values(f.students));
    await f.cleanup();
  }
}
