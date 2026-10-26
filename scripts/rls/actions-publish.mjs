// Phase 11 step 7 over HTTP: the publish bar on /grades/averages and its
// actions (publishGrades / unpublishGrades), the parent's report-card pages,
// the home tile, the notification's link and the "grades" push switch.
import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin } from "./fixtures.mjs";
import { createGradesFixture } from "./grades-fixture.mjs";

export async function publishActions({ fx, baseUrl }) {
  const label = (s) => `[P11 publish action] ${s}`;
  const f = await createGradesFixture(fx, "p11pa");
  const A = f.A;
  const { maths, hist } = f.subjects;
  const { a1, a2 } = f.students;
  const { cA } = f.classes;
  const [S1] = f.periods;
  const AVG = "/fr/grades/averages";
  const ids = {
    publish: actionId("src/lib/grades/publish-actions.ts", "publishGrades"),
    unpublish: actionId("src/lib/grades/publish-actions.ts", "unpublishGrades"),
    prefs: actionId("src/lib/push/actions.ts", "savePushPreferences"),
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
  const grade = (student, subject, number, score, kind = "control") =>
    ({ school_id: A.id, period_id: S1.id, student_id: student, subject_id: subject, kind, number, score, absent: false });
  const avgPage = `${AVG}?year=${f.year}&class=${cA}&period=${S1.id}`;

  try {
    const { error } = await admin.from("grades").insert([
      grade(a1, maths, 1, 14), grade(a1, maths, 1, 16, "activities"), grade(a1, hist, 1, 12), grade(a2, maths, 1, 9),
    ]);
    if (error) throw new Error(`publish fixture: ${error.message}`);

    // --- Staff: the bar ----------------------------------------------------------------------------------
    let dir = await page("dirA", avgPage);
    check(label("director: the bar says not published, and why it cannot be yet (semester unlocked)"),
      dir.html.includes('data-publish-bar="draft"') && dir.html.includes("data-publish-needs-lock") && dir.html.includes("data-publish-button"));
    await expect("publishing an unlocked semester → periodNotLocked", call("dirA", "publish", AVG, cA, S1.id, true), "periodNotLocked");
    await admin.from("grading_periods").update({ locked_at: new Date().toISOString() }).eq("id", S1.id);
    await expect("the surveillant cannot publish", call("survA", "publish", AVG, cA, S1.id, true), "forbidden");
    await expect("the director of B cannot publish A's class", call("dirB", "publish", AVG, cA, S1.id, true), "notFound");
    const r = await expect("the director publishes S1", call("dirA", "publish", AVG, cA, S1.id, true), "ok");
    check(label("…3 cards"), r.data?.cards === 3, JSON.stringify(r.data));
    dir = await page("dirA", avgPage);
    check(label("…the bar now says published"), dir.html.includes('data-publish-bar="published"') && !dir.html.includes("data-publish-needs-lock"));
    const surv = await page("survA", avgPage);
    check(label("surveillant: sees it is published, no button"), surv.html.includes('data-publish-bar="published"') && !surv.html.includes("data-publish-button"));
    const { data: audit } = await admin.from("audit_logs").select("action").eq("school_id", A.id).eq("action", "grades.publish");
    check(label("…publishing is in the audit log"), (audit ?? []).length === 1);

    // --- Parent ------------------------------------------------------------------------------------------
    const { data: pub } = await admin.from("grade_publications").select("id").eq("class_id", cA).eq("period_id", S1.id).single();
    const list = await page("parent", `/fr/portal/grades?child=${a1}`);
    check(label("parent: the child's published card in the list"), list.status === 200 && list.html.includes(`data-card-link="${pub.id}"`), `${list.status} ${list.redirect}`);
    const detail = await page("parent", `/fr/portal/grades/${pub.id}?child=${a1}`);
    const average = detail.html.split("data-card-average")[1]?.match(/>([\d,]+)</)?.[1];
    check(label("…the card: general average (15 + 12) / 2 = 13,50, subjects, rank"),
      detail.html.includes("data-report-card") && average === "13,50" && detail.html.includes(`data-card-subject="${maths}"`)
        && detail.html.includes('data-card-rank="1"'), String(average));
    const home = await page("parent", `/fr/portal?child=${a1}`);
    check(label("…the home page has the Notes tile"), home.html.includes('data-home-tile="grades"'));
    const notifs = await page("parent", "/fr/portal/notifications");
    check(label("…the notification opens this card"), notifs.html.includes(`/portal/grades/${pub.id}?child=${a1}`));
    const unknown = await page("parent", `/fr/portal/grades/${crypto.randomUUID()}?child=${a1}`);
    check(label("…an unknown card: not found"), unknown.html === "" || unknown.html.includes("NEXT_HTTP_ERROR_FALLBACK;404") || unknown.status === 404, String(unknown.status));
    const staffList = await page("dirA", `/fr/portal/grades?child=${a1}`);
    check(label("the director cannot open the parent pages"), staffList.redirect !== "" && !staffList.html.includes("data-card-link"), staffList.redirect);

    await expect("the parent switches grades pushes off", call("parent", "prefs", "/fr/portal/notifications", { absences: true, remarks: true, announcements: true, grades: false }), "ok");
    const { data: pref } = await admin.from("push_preferences").select("grades").eq("profile_id", f.parent.id).single();
    check(label("…stored"), pref?.grades === false);
    await expect("the 3-switch call still works", call("parent", "prefs", "/fr/portal/notifications", { absences: true, remarks: true, announcements: false }), "ok");

    // --- Unpublishing ------------------------------------------------------------------------------------
    await expect("the surveillant cannot withdraw", call("survA", "unpublish", AVG, pub.id), "forbidden");
    await expect("the director withdraws it", call("dirA", "unpublish", AVG, pub.id), "ok");
    const after = await page("parent", `/fr/portal/grades?child=${a1}`);
    check(label("…the parent's list is empty again"), !after.html.includes("data-card-link=") && after.status === 200);
    await expect("withdrawing twice → notFound", call("dirA", "unpublish", AVG, pub.id), "notFound");
  } finally {
    await admin.from("push_preferences").delete().eq("profile_id", f.parent.id);
    await admin.from("grading_periods").update({ locked_at: null }).eq("id", S1.id);
    await admin.from("grade_publications").delete().eq("class_id", cA);
    await admin.from("grades").delete().in("student_id", Object.values(f.students));
    await f.cleanup();
  }
}
