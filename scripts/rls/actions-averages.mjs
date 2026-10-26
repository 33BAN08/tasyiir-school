// Phase 11 step 5: /grades/averages (averages + ranks of a class) and the
// "Moy." column of a grade sheet, over HTTP as real users. Numbers come from
// class_averages(); the director and the surveillant read the page, a teacher
// is sent to their sheets (where their subject's average shows), others home.
import { sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin } from "./fixtures.mjs";
import { createGradesFixture } from "./grades-fixture.mjs";

export async function averagesActions({ fx, baseUrl }) {
  const label = (s) => `[P11 averages page] ${s}`;
  const f = await createGradesFixture(fx, "p11ap");
  const A = f.A;
  const { maths, hist } = f.subjects;
  const { cA } = f.classes;
  const { a1, a2, a3, b1 } = f.students;
  const [S1] = f.periods;
  const cookies = {};
  for (const name of ["dirA", "survA", "tchA", "mgrA", "dirB"]) cookies[name] = await sessionCookies(fx.users[name]);
  cookies.parent = await sessionCookies(f.parent);
  const page = async (who, path) => {
    const res = await fetch(new URL(path, baseUrl), { headers: { cookie: cookies[who] }, redirect: "manual" });
    const html = res.status === 200 ? await res.text() : "";
    const streamed = html.match(/NEXT_REDIRECT;\w+;([^;]+);/)?.[1];
    return { status: res.status, redirect: streamed ?? res.headers.get("location") ?? "", html: streamed ? "" : html };
  };
  const grade = (student, subject, number, score, kind = "control") =>
    ({ school_id: A.id, period_id: S1.id, student_id: student, subject_id: subject, kind, number, score, absent: false });
  // The table cell of one student + column (subject id or "general").
  // A subject cell also holds "· 2/3" (and "incomplet"): read its value span only.
  const cell = (html, student, column) => {
    const row = html.split(`data-student="${student}"`)[1]?.split("</tr>")[0] ?? "";
    const after = row.split(`data-average="${column}"`)[1];
    if (column === "general" || after === undefined) return text(after);
    return after.split("data-average-value")[1]?.match(/>([^<]*)</)?.[1] ?? null;
  };
  // What a cell shows: up to its </td>, tags and React's <!-- --> left out.
  const text = (after) => (after === undefined ? null
    : after.slice(after.indexOf(">") + 1).split("</td>")[0].replace(/<!-- -->/g, "").replace(/<span class="sr-only">.*?<\/span>/g, "").replace(/<[^>]+>/g, "").trim());

  try {
    const { error } = await admin.from("grades").insert([
      grade(a1, maths, 1, 14), grade(a1, maths, 1, 17, "activities"), grade(a1, hist, 1, 12), grade(a2, maths, 1, 10),
    ]);
    if (error) throw new Error(`averages page fixture: ${error.message}`);
    const path = `/fr/grades/averages?year=${f.year}&class=${cA}&period=${S1.id}`;

    const dir = await page("dirA", path);
    check(label("director: the class's table opens"), dir.status === 200 && dir.html.includes("data-averages-table"), `${dir.status} ${dir.redirect}`);
    check(label("…students by rank: a1 first, a2 second, a3 without a rank"),
      dir.html.includes(`data-student="${a1}" data-rank="1"`) && dir.html.includes(`data-student="${a2}" data-rank="2"`)
        && dir.html.includes(`data-student="${a3}" data-rank=""`)
        && dir.html.indexOf(`data-student="${a1}"`) < dir.html.indexOf(`data-student="${a2}"`));
    check(label("…Maths 15,50 (activités = one contrôle), HG 12,00, general 13,75"),
      cell(dir.html, a1, maths) === "15,50" && cell(dir.html, a1, hist) === "12,00" && cell(dir.html, a1, "general") === "13,75",
      `${cell(dir.html, a1, maths)} ${cell(dir.html, a1, hist)} ${cell(dir.html, a1, "general")}`);
    check(label("…a subject without a mark shows — and is flagged on the general average"),
      cell(dir.html, a2, hist) === "—" && cell(dir.html, a2, "general") === "10,00" && dir.html.includes('data-missing="1"'));
    check(label("…class figures and the semester / year switch"),
      dir.html.includes('data-class-figure="classAverage"') && dir.html.includes('data-period-link="year"'));
    const year = await page("dirA", `/fr/grades/averages?year=${f.year}&class=${cA}&period=year`);
    check(label("the year: (S1 + S2) / 2 with S2 empty = the S1 average"),
      cell(year.html, a1, "general") === "13,75" && year.html.includes('aria-current="page" data-period-link="year"'), cell(year.html, a1, "general"));
    const surv = await page("survA", path);
    check(label("surveillant (grades.view): the same table"), cell(surv.html, a1, "general") === "13,75");
    const sheetLink = await page("dirA", `/fr/grades?year=${f.year}&class=${cA}&subject=${maths}&period=${S1.id}`);
    check(label("the director's sheet links to the class's averages"), sheetLink.html.includes("data-averages-link"));

    const tch = await page("tchA", path);
    check(label("teacher: sent to their sheets"), tch.redirect.includes("/grades") && !tch.html.includes("data-averages-table"), tch.redirect);
    const sheet = await page("tchA", `/fr/grades?class=${cA}&subject=${maths}&period=${S1.id}`);
    const sheetCell = sheet.html.split(`<td data-sheet-average="${a1}"`)[1]?.split("</td>")[0] ?? "";
    const avg = sheetCell.split("data-sheet-average-value")[1]?.match(/>([^<]*)</)?.[1] ?? null;
    check(label("…their sheet shows the saved Maths average 15,50 (no link to the class page)"),
      avg === "15,50" && !sheet.html.includes("data-averages-link"), String(avg));
    check(label("…with its count: contrôle 1 + activités = 2 of 3, incomplet"),
      sheetCell.includes('data-sheet-count="· 2/3"') && sheetCell.includes("data-incomplete"), sheetCell.slice(0, 200));
    for (const who of ["mgrA", "parent"]) {
      const r = await page(who, path);
      check(label(`${who}: sent away, no averages`), r.redirect !== "" && !r.html.includes("data-averages-table"), r.redirect);
    }
    const b = await page("dirB", path);
    check(label("director of B asking for A's class: never A's students"),
      !b.html.includes(`data-student="${a1}"`) && !b.html.includes(`data-student="${b1}"`));
  } finally {
    await admin.from("grades").delete().in("student_id", Object.values(f.students));
    await f.cleanup();
  }
}
