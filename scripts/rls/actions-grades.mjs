// Phase 11 step 4: /grades (grade sheets) and its action saveGrades, over HTTP
// as real users. A teacher sees and saves only their own class + subject pairs;
// the director any class; the surveillant reads (no inputs); a parent and staff
// without a grades permission are sent away; a locked semester is read-only.
import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin } from "./fixtures.mjs";
import { createGradesFixture } from "./grades-fixture.mjs";

const PAGE = "/fr/grades";

export async function gradesActions({ fx, baseUrl }) {
  const label = (s) => `[P11 grades action] ${s}`;
  const f = await createGradesFixture(fx, "p11ga");
  const { maths, hist } = f.subjects;
  const { cA, cB, cP } = f.classes;
  const { a1, a2, a3, b1, p1 } = f.students;
  const [S1] = f.periods;
  const id = actionId("src/lib/grades/actions.ts", "saveGrades");
  const cookies = {};
  for (const name of ["dirA", "survA", "tchA", "mgrA", "dirB"]) cookies[name] = await sessionCookies(fx.users[name]);
  cookies.tch2 = await sessionCookies(f.tch2);
  cookies.parent = await sessionCookies(f.parent);
  const call = (who, ...args) => callAction(baseUrl, { id, path: PAGE, args, cookies: cookies[who] });
  const expect = async (name, promise, wanted) => {
    const r = await promise;
    const got = r.ok ? "ok" : r.error;
    check(label(name), got === wanted, got);
    return r;
  };
  const page = async (who, query) => {
    const res = await fetch(new URL(`${PAGE}${query}`, baseUrl), { headers: { cookie: cookies[who] }, redirect: "manual" });
    const html = res.status === 200 ? await res.text() : "";
    const streamed = html.match(/NEXT_REDIRECT;\w+;([^;]+);/)?.[1];
    return { status: res.status, redirect: streamed ?? res.headers.get("location") ?? "", html: streamed ? "" : html };
  };
  const c = (studentId, number, score, extra = {}) => ({ studentId, kind: "control", number, score, absent: false, clear: false, ...extra });
  const grades = async () => (await admin.from("grades").select("student_id, kind, number, score, absent").eq("period_id", S1.id)).data ?? [];
  const find = (list, student, number, kind = "control") => list.find((g) => g.student_id === student && g.number === number && g.kind === kind);

  try {
    // --- Pages ---------------------------------------------------------------------------------------
    const tch = await page("tchA", `?class=${cA}&subject=${maths}&period=${S1.id}`);
    check(label("teacher: their sheet opens with an input per student (phone and grid views)"),
      tch.status === 200 && tch.html.includes(`data-mark="${a1}|control|1"`) && tch.html.includes(`data-mark="${a3}|activities|1"`)
        && tch.html.includes("data-phone-sheet") && tch.html.includes("data-grid-sheet"), `${tch.status} ${tch.redirect}`);
    check(label("…the number keyboard and \"next\" key on the inputs"),
      /inputMode="decimal"|inputmode="decimal"/.test(tch.html) && /enterKeyHint="next"|enterkeyhint="next"/.test(tch.html));
    check(label("…scale and contrôles of the level shown"), tch.html.includes("data-sheet-rules"));
    const other = await page("tchA", `?class=${cB}&subject=${maths}&period=${S1.id}`);
    check(label("teacher asking for another class gets their own sheet, never B's students"),
      other.status === 200 && !other.html.includes(`data-student="${b1}"`) && other.html.includes(`data-student="${a1}"`));
    const dir = await page("dirA", `?class=${cB}&subject=${maths}&period=${S1.id}`);
    check(label("director: any class, with inputs"), dir.html.includes(`data-mark="${b1}|control|1"`));
    const surv = await page("survA", `?class=${cA}&subject=${maths}&period=${S1.id}`);
    check(label("surveillant: the sheet without any input (read-only)"),
      surv.status === 200 && surv.html.includes(`data-mark-text="${a1}|control|1"`) && !surv.html.includes("data-mark=\""));
    const mgr = await page("mgrA", "");
    check(label("office manager (no grades permission): sent home"), mgr.redirect !== "" && !mgr.html.includes("data-student="), mgr.redirect);
    const par = await page("parent", "");
    check(label("parent: sent to the portal"), par.redirect !== "" && !par.html.includes("data-student="), par.redirect);

    // --- Saving ---------------------------------------------------------------------------------------
    const r1 = await expect("the teacher saves their sheet", call("tchA", cA, maths, S1.id, [
      c(a1, 1, 14.5), c(a2, 1, null, { absent: true }), c(a3, 1, 8), c(a1, 1, 16, { kind: "activities" }),
    ]), "ok");
    let list = await grades();
    check(label("…4 marks stored (one absent)"), r1.data?.saved === 4 && Number(find(list, a1, 1)?.score) === 14.5
      && find(list, a2, 1)?.absent === true && Number(find(list, a1, 1, "activities")?.score) === 16);
    await expect("change + clear in one save", call("tchA", cA, maths, S1.id, [c(a1, 1, 15), c(a3, 1, null, { clear: true })]), "ok");
    list = await grades();
    check(label("…changed and cleared"), Number(find(list, a1, 1)?.score) === 15 && !find(list, a3, 1));
    const after = await page("tchA", `?class=${cA}&subject=${maths}&period=${S1.id}`);
    check(label("the sheet shows the saved marks (15, absent)"), after.html.includes('value="15"') && after.html.includes('value="abs"'));

    const before = JSON.stringify(await grades());
    await expect("21 → invalidMark (above any scale), nothing saved", call("tchA", cA, maths, S1.id, [c(a2, 2, 12), c(a3, 2, 21)]), "invalidMark");
    await expect("a mark the database refuses (contrôle 3 of 2) → numberTooHigh", call("tchA", cA, maths, S1.id, [c(a2, 2, 12), c(a3, 3, 10)]), "numberTooHigh");
    await expect("1,234 → invalidMark", call("tchA", cA, maths, S1.id, [c(a2, 2, 1.234)]), "invalidMark");
    await expect("no score and not absent → invalidMark", call("tchA", cA, maths, S1.id, [c(a2, 2, null)]), "invalidMark");
    await expect("10,5 / 10 in primaire (director) → aboveScale", call("dirA", cP, maths, S1.id, [c(p1, 1, 10.5)]), "aboveScale");
    check(label("…nothing saved by the refused sheets"), JSON.stringify(await grades()) === before);

    await expect("the teacher cannot save another class", call("tchA", cB, maths, S1.id, [c(b1, 1, 10)]), "forbidden");
    await expect("the teacher cannot save a subject they do not teach", call("tchA", cA, hist, S1.id, [c(a1, 1, 10)]), "forbidden");
    await expect("the other teacher cannot change class A", call("tch2", cA, maths, S1.id, [c(a1, 1, 2)]), "forbidden");
    await expect("the director saves class B", call("dirA", cB, maths, S1.id, [c(b1, 1, 12)]), "ok");
    await expect("the surveillant cannot save", call("survA", cA, maths, S1.id, [c(a1, 2, 10)]), "forbidden");
    await expect("a parent cannot save", call("parent", cA, maths, S1.id, [c(a1, 2, 10)]), "forbidden");
    await expect("an office manager cannot save", call("mgrA", cA, maths, S1.id, [c(a1, 2, 10)]), "forbidden");
    await expect("the director of B cannot save into A (A's semester does not exist for B)", call("dirB", cA, maths, S1.id, [c(a1, 2, 10)]), "notFound");
    await expect("not an id → notFound", call("tchA", cA, maths, "nope", [c(a1, 2, 10)]), "notFound");
    const none = await expect("an empty save does nothing", call("tchA", cA, maths, S1.id, []), "ok");
    check(label("…0 saved"), none.data?.saved === 0);

    // --- Locked semester ------------------------------------------------------------------------------
    await admin.from("grading_periods").update({ locked_at: new Date().toISOString() }).eq("id", S1.id);
    await expect("locked: the teacher's save → periodLocked", call("tchA", cA, maths, S1.id, [c(a2, 2, 12)]), "periodLocked");
    await expect("locked: the director's save → periodLocked", call("dirA", cB, maths, S1.id, [c(b1, 2, 12)]), "periodLocked");
    const locked = await page("tchA", `?class=${cA}&subject=${maths}&period=${S1.id}`);
    check(label("locked: the sheet is read-only with the lock banner"),
      locked.html.includes("data-sheet-locked") && !locked.html.includes("data-mark=\"") && locked.html.includes(`data-mark-text="${a1}|control|1"`));
    await admin.from("grading_periods").update({ locked_at: null }).eq("id", S1.id);

    // --- Module off -----------------------------------------------------------------------------------
    await admin.from("school_modules").update({ enabled: false }).eq("school_id", f.A.id).eq("module_key", "grades");
    await expect("module off: the director cannot save", call("dirA", cA, maths, S1.id, [c(a2, 2, 12)]), "forbidden");
    const off = await page("dirA", "");
    check(label("module off: \"not in your plan\""), off.status === 200 && !off.html.includes("data-student="));
    await admin.from("school_modules").update({ enabled: true }).eq("school_id", f.A.id).eq("module_key", "grades");
  } finally {
    await f.cleanup();
  }
}
