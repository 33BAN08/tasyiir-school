// Phase 11 step 8 over HTTP: the council-remarks screen + its action, and the
// printable report cards (/print/report-cards): grades.manage prints the
// class or one student; a parent only their own child's published card;
// everyone else is sent home; nothing unpublished prints.
import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin } from "./fixtures.mjs";
import { createGradesFixture } from "./grades-fixture.mjs";

export async function reportPrintActions({ fx, baseUrl }) {
  const label = (s) => `[P11 print] ${s}`;
  const f = await createGradesFixture(fx, "p11rp");
  const A = f.A;
  const { maths, hist } = f.subjects;
  const { a1, a2, a3 } = f.students;
  const { cA } = f.classes;
  const [S1] = f.periods;
  const COUNCIL = "/fr/grades/council";
  const AVG = "/fr/grades/averages";
  const ids = {
    council: actionId("src/lib/grades/council-actions.ts", "saveCouncilRemarks"),
    publish: actionId("src/lib/grades/publish-actions.ts", "publishGrades"),
    unpublish: actionId("src/lib/grades/publish-actions.ts", "unpublishGrades"),
  };
  const cookies = {};
  for (const name of ["dirA", "survA", "tchA", "dirB"]) cookies[name] = await sessionCookies(fx.users[name]);
  cookies.parent = await sessionCookies(f.parent);
  const call = (who, action, path, ...args) => callAction(baseUrl, { id: ids[action], path, args, cookies: cookies[who] });
  const expect = async (name, promise, wanted) => {
    const r = await promise;
    const got = r.ok ? "ok" : r.error;
    check(label(name), got === wanted, got);
    return r;
  };
  const page = async (who, path) => {
    const res = await fetch(new URL(path, baseUrl), { headers: { cookie: cookies[who] }, redirect: "manual" });
    const html = res.status === 200 ? await res.text() : "";
    const streamed = html.match(/NEXT_REDIRECT;\w+;([^;]+);/)?.[1];
    return { status: res.status, redirect: streamed ?? res.headers.get("location") ?? "", html: streamed ? "" : html };
  };
  const sheets = (html) => (html.match(/data-report-card-sheet="/g) ?? []).length;
  const grade = (student, subject, score) =>
    ({ school_id: A.id, period_id: S1.id, student_id: student, subject_id: subject, kind: "control", number: 1, score, absent: false });
  const councilPage = `${COUNCIL}?year=${f.year}&class=${cA}&period=${S1.id}`;

  try {
    const { error } = await admin.from("grades").insert([grade(a1, maths, 17), grade(a1, hist, 14), grade(a2, maths, 9), grade(a3, maths, 12)]);
    if (error) throw new Error(`print fixture: ${error.message}`);

    // --- Council remarks screen ------------------------------------------------------------------------
    const dir = await page("dirA", councilPage);
    check(label("director: one box per student"), dir.status === 200 && dir.html.includes(`data-council-input="${a1}"`) && dir.html.includes(`data-council-input="${a3}"`));
    const surv = await page("survA", councilPage);
    check(label("surveillant: reads, no box"), surv.status === 200 && surv.html.includes(`data-council-text="${a1}"`) && !surv.html.includes("data-council-input"));
    for (const who of ["tchA", "parent"]) {
      const r = await page(who, councilPage);
      check(label(`${who}: sent away`), r.redirect !== "" && !r.html.includes("data-council"), r.redirect);
    }
    await expect("the director saves two remarks", call("dirA", "council", COUNCIL, cA, S1.id, [
      { studentId: a1, body: "Excellent semestre." }, { studentId: a2, body: "Doit fournir plus d'efforts." },
    ]), "ok");
    await expect("the surveillant cannot save", call("survA", "council", COUNCIL, cA, S1.id, [{ studentId: a1, body: "Non" }]), "forbidden");
    await expect("501 characters → tooLong", call("dirA", "council", COUNCIL, cA, S1.id, [{ studentId: a1, body: "x".repeat(501) }]), "tooLong");
    await expect("the director of B cannot write into A's class", call("dirB", "council", COUNCIL, cA, S1.id, [{ studentId: a1, body: "Non" }]), "notFound");

    // --- Nothing prints before publishing -------------------------------------------------------------
    const unpublished = await page("dirA", AVG + `?year=${f.year}&class=${cA}&period=${S1.id}`);
    check(label("not published: no print button, but the council link"), !unpublished.html.includes("data-print-class") && unpublished.html.includes("data-council-link"));

    await admin.from("grading_periods").update({ locked_at: new Date().toISOString() }).eq("id", S1.id);
    await expect("publish S1", call("dirA", "publish", AVG, cA, S1.id, true), "ok");
    const { data: pub } = await admin.from("grade_publications").select("id").eq("class_id", cA).eq("period_id", S1.id).single();
    const avg = await page("dirA", AVG + `?year=${f.year}&class=${cA}&period=${S1.id}`);
    check(label("published: print the class + one button per student"),
      avg.html.includes("data-print-class") && avg.html.includes(`data-print-student="${a1}"`) && !avg.html.includes("data-council-changed"));

    // --- Staff print ----------------------------------------------------------------------------------
    const all = await page("dirA", `/fr/print/report-cards?publication=${pub.id}`);
    check(label("director: the whole class, one sheet per student"), all.status === 200 && sheets(all.html) === 3, `${all.status} ${sheets(all.html)} ${all.redirect}`);
    // One student per page: the class page streams parts of each sheet later in the document.
    const a1Sheet = (await page("dirA", `/fr/print/report-cards?publication=${pub.id}&student=${a1}`)).html;
    check(label("…a1: general 15,50, mention Bien, rank 1, the council remark"),
      a1Sheet.includes(">15,50") && a1Sheet.includes('data-sheet-mention="bien"') && a1Sheet.includes('data-sheet-rank="1"') && a1Sheet.includes("Excellent semestre."));
    const a2Sheet = (await page("dirA", `/fr/print/report-cards?publication=${pub.id}&student=${a2}`)).html;
    check(label("…a2 (9,00): no mention"), a2Sheet.includes('data-sheet-mention=""') && !a2Sheet.includes('data-sheet-mention="passable"'));
    const oneStudent = await page("dirA", `/fr/print/report-cards?publication=${pub.id}&student=${a2}`);
    check(label("director: one student"), sheets(oneStudent.html) === 1 && oneStudent.html.includes(`data-report-card-sheet="${a2}"`));
    const ar = await page("dirA", `/ar/print/report-cards?publication=${pub.id}&student=${a1}`);
    check(label("Arabic: rtl page, Arabic title, mention حسن"), ar.html.includes('dir="rtl"') && ar.html.includes("بيان النقط") && ar.html.includes("حسن"));
    for (const who of ["survA", "tchA"]) {
      const r = await page(who, `/fr/print/report-cards?publication=${pub.id}`);
      check(label(`${who}: sent home, no sheet`), r.redirect !== "" && sheets(r.html) === 0, r.redirect);
    }
    const bPrint = await page("dirB", `/fr/print/report-cards?publication=${pub.id}`);
    check(label("director of B: no sheet of A"), sheets(bPrint.html) === 0);

    // --- Parent print ---------------------------------------------------------------------------------
    const card = await page("parent", `/fr/portal/grades/${pub.id}?child=${a1}`);
    check(label("parent card page: download button + the council remark"), card.html.includes("data-download-card") && card.html.includes("data-card-council"));
    const own = await page("parent", `/fr/print/report-cards?publication=${pub.id}&student=${a1}`);
    check(label("parent: their child's sheet only"), own.status === 200 && sheets(own.html) === 1 && own.html.includes(`data-report-card-sheet="${a1}"`), `${own.status} ${own.redirect}`);
    const other = await page("parent", `/fr/print/report-cards?publication=${pub.id}&student=${a2}`);
    check(label("parent: another child → nothing"), sheets(other.html) === 0 && !other.html.includes(`data-report-card-sheet="${a2}"`));
    const noStudent = await page("parent", `/fr/print/report-cards?publication=${pub.id}`);
    check(label("parent: no student given → nothing (never the class)"), sheets(noStudent.html) === 0);

    // --- Snapshot: a change shows as pending, Republier picks it up, rank hidden -----------------------
    await call("dirA", "council", COUNCIL, cA, S1.id, [{ studentId: a1, body: "Remarque changée." }]);
    const changed = await page("dirA", AVG + `?year=${f.year}&class=${cA}&period=${S1.id}`);
    check(label("a remark changed after publishing is flagged"), changed.html.includes('data-council-changed="1"'));
    const stale = await page("dirA", `/fr/print/report-cards?publication=${pub.id}&student=${a1}`);
    check(label("…the print still shows the published one"), stale.html.includes("Excellent semestre.") && !stale.html.includes("Remarque changée."));
    await expect("Republier without the rank", call("dirA", "publish", AVG, cA, S1.id, false), "ok");
    const fresh = await page("dirA", `/fr/print/report-cards?publication=${pub.id}&student=${a1}`);
    check(label("…the print has the new remark and no rank"), fresh.html.includes("Remarque changée.") && !fresh.html.includes("data-sheet-rank="));

    await expect("withdraw", call("dirA", "unpublish", AVG, pub.id), "ok");
    const gone = await page("parent", `/fr/print/report-cards?publication=${pub.id}&student=${a1}`);
    check(label("withdrawn: nothing prints"), sheets(gone.html) === 0);
  } finally {
    await admin.from("grading_periods").update({ locked_at: null }).eq("id", S1.id);
    await admin.from("grade_publications").delete().eq("class_id", cA);
    await admin.from("council_remarks").delete().eq("class_id", cA);
    await admin.from("grades").delete().in("student_id", Object.values(f.students));
    await f.cleanup();
  }
}
