// Phase 5 step 5 Server Actions: student import (preview, then import all or
// nothing), called over HTTP as real users on /fr/students/import with real
// files (CSV in several encodings, .xlsx).
import writeExcelFile from "write-excel-file/node";

import { actionId, callActionWithForm, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin } from "./fixtures.mjs";
import { randomMobile } from "./phase5-guardians.mjs";

const PAGE = "/fr/students/import";
const FILE = "src/lib/students/import/import-actions.ts";
const FR_HEADERS = ["Nom (latin)", "Prénom (latin)", "Nom (arabe)", "Prénom (arabe)", "Date de naissance (jj/mm/aaaa)",
  "Sexe (G/F)", "Code Massar", "Classe", "Nom du parent", "Prénom du parent", "Téléphone du parent", "Lien (Père/Mère/Tuteur)"];

/** A current year and a class in school A (reused if the school already has a current year). */
export async function setupSchool(A) {
  const created = {};
  let { data: year } = await admin.from("academic_years").select("id").eq("school_id", A.id).eq("is_current", true).maybeSingle();
  if (!year) {
    year = (await admin.from("academic_years")
      .insert({ school_id: A.id, label: "2090-2091", start_date: "2090-09-01", end_date: "2091-06-30", is_current: true })
      .select("id").single()).data;
    created.yearId = year.id;
  }
  const level = (await admin.from("levels").insert({ school_id: A.id, name: "IMP-Niveau", cycle: "college" }).select("id").single()).data;
  const cls = (await admin.from("classes")
    .insert({ school_id: A.id, academic_year_id: year.id, level_id: level.id, name: "IMP-1A" }).select("id").single()).data;
  return { yearId: year.id, levelId: level.id, classId: cls.id, created };
}

export async function cleanup(A, s) {
  await admin.from("guardians").delete().eq("school_id", A.id);
  await admin.from("students").delete().eq("school_id", A.id).like("last_name", "Imp%");
  await admin.from("classes").delete().eq("id", s.classId);
  await admin.from("levels").delete().eq("id", s.levelId);
  if (s.created.yearId) await admin.from("academic_years").delete().eq("id", s.created.yearId);
}

const csvBlob = (lines, { bom = false } = {}) =>
  new Blob([...(bom ? [Uint8Array.from([0xef, 0xbb, 0xbf])] : []), lines.join("\r\n")], { type: "text/csv" });
const fileOf = (blob, name) => new File([blob], name, { type: blob.type });
const massar = () => `I${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;

function context(fx, baseUrl) {
  const cookies = {};
  const ready = (async () => {
    for (const name of ["dirA", "survA"]) cookies[name] = await sessionCookies(fx.users[name]);
  })();
  const call = async (who, action, file, extra = {}) => {
    await ready;
    return callActionWithForm(baseUrl, { id: actionId(FILE, action), path: PAGE, fields: { file, ...extra }, cookies: cookies[who] });
  };
  return { call };
}

export async function importPreviewActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const s = await setupSchool(A);
  const { call } = context(fx, baseUrl);
  const existing = massar();
  await admin.from("students").insert({ school_id: A.id, first_name: "Old", last_name: "Imp-Old", birth_date: "2013-01-01", gender: "male", code_massar: existing });
  const parentPhone = randomMobile();
  const typed = `0${parentPhone.slice(4)}`;
  const m1 = massar();

  try {
    const good = fileOf(csvBlob([
      FR_HEADERS.join(";"),
      `Imp-Benali;Amine;بنعلي;أمين;02/03/2014;G;${m1};IMP-1A;Imp-Benali;Mohammed;${typed};Père`,
      `Imp-Benali;Sara;;;5/9/2015;F;;imp-1a;Imp-Benali;Mohammed;${typed};père`,
      `Imp-Bad;Date;;;31/02/2014;G;;IMP-1A;;;;`,
      `Imp-Bad;Class;;;01/01/2014;F;;IMP-9Z;;;;`,
      `Imp-Old;Again;;;01/01/2013;G;${existing};IMP-1A;;;;`,
      `Imp-Dup;Massar;;;01/01/2014;G;${m1.toLowerCase()};IMP-1A;;;;`,
      `Imp-Bad;Phone;;;01/01/2014;G;;IMP-1A;Imp-X;Y;0522123456;Mère`,
      `Imp-Bad;Gender;;;01/01/2014;X;;IMP-1A;;;;`,
      `Imp-Other;Name;;;01/01/2014;F;;IMP-1A;Imp-Autre;Nom;${typed};Mère`,
    ], { bom: true }), "eleves.csv");

    const denied = await call("survA", "previewImport", good);
    check("[P5 import] surveillant cannot import", !denied.ok && denied.error === "forbidden", denied.error ?? "ok");

    const r = await call("dirA", "previewImport", good);
    check("[P5 import] preview of a UTF-8 (BOM) \";\" CSV works", r.ok, r.error ?? "");
    const byLine = Object.fromEntries((r.data?.rows ?? []).map((row) => [row.line, row]));
    const issue = (line) => (byLine[line]?.issues ?? []).map((i) => `${i.column}:${i.key}${i.line ? `@${i.line}` : ""}`).join(",");
    check("[P5 import] line 2 ready, Arabic names intact, parent phone normalised",
      byLine[2]?.status === "ready" && byLine[2].lastNameAr === "بنعلي" && byLine[2].parent?.phone === parentPhone && byLine[2].parent?.relation === "father",
      JSON.stringify(byLine[2]));
    check("[P5 import] line 3 (sibling, same parent, d/m/yyyy, class case ignored) ready",
      byLine[3]?.status === "ready" && byLine[3].birthDate === "2015-09-05", `${byLine[3]?.status} ${issue(3)}`);
    check("[P5 import] 31/02/2014 → invalidDate", issue(4) === "birthDate:invalidDate", issue(4));
    check("[P5 import] unknown class → unknownClass", issue(5) === "className:unknownClass", issue(5));
    check("[P5 import] Massar code already in the school → exists (skipped, no error)",
      byLine[6]?.status === "exists" && issue(6) === "", `${byLine[6]?.status} ${issue(6)}`);
    check("[P5 import] same Massar code twice in the file → duplicate, pointing at line 2",
      issue(7) === "codeMassar:massarDuplicateInFile@2", issue(7));
    check("[P5 import] landline parent phone → invalidPhone", issue(8) === "parentPhone:invalidPhone", issue(8));
    check("[P5 import] gender X → genderRequired", issue(9) === "gender:genderRequired", issue(9));
    check("[P5 import] same phone, another parent name → phoneNameConflict @2",
      issue(10) === "parentPhone:phoneNameConflict@2", issue(10));
    check("[P5 import] counts", JSON.stringify(r.data?.counts) === JSON.stringify({ ready: 2, exists: 1, error: 6 }), JSON.stringify(r.data?.counts));

    const commit = await call("dirA", "commitImport", good);
    check("[P5 import] import refused while rows have errors (hasErrors)", !commit.ok && commit.error === "hasErrors", commit.error ?? "ok");
    const { count } = await admin.from("students").select("id", { count: "exact", head: true }).eq("school_id", A.id).like("last_name", "Imp-B%");
    check("[P5 import] …and nothing was saved", count === 0, `${count} saved`);

    // Possible duplicates: a warning, never an error.
    const dup = await call("dirA", "previewImport", fileOf(csvBlob([
      FR_HEADERS.slice(0, 8).join(";"),
      `IMP-OLD;old;;;01/01/2013;G;;IMP-1A`,
      `Imp-Twin;Nour;;;04/04/2014;F;;IMP-1A`,
      `Imp Twin;NOUR;;;4/4/2014;F;;IMP-1A`,
    ]), "dup.csv"));
    const d = Object.fromEntries((dup.data?.rows ?? []).map((row) => [row.line, row]));
    check("[P5 import] same name + birth date as a student of the school → possibleDuplicate (case, dash ignored), still ready",
      d[2]?.status === "ready" && d[2].warnings?.[0]?.key === "possibleDuplicate" && d[2].warnings[0].name === "Imp-Old Old" && d[2].warnings[0].codeMassar === existing,
      JSON.stringify(d[2]?.warnings));
    check("[P5 import] same name + birth date as another line → possibleDuplicateInFile @3, still ready",
      d[3]?.warnings?.length === 0 && d[4]?.status === "ready" && d[4].warnings?.[0]?.key === "possibleDuplicateInFile" && d[4].warnings[0].line === 3,
      JSON.stringify(d[4]?.warnings));
    check("[P5 import] …counted as 2 possible duplicates, 0 errors",
      dup.data?.duplicates === 2 && dup.data?.counts.error === 0, JSON.stringify({ duplicates: dup.data?.duplicates, counts: dup.data?.counts }));

    // Windows-1256 CSV, Arabic headers.
    const cp1256 = new Map();
    [...new TextDecoder("windows-1256").decode(Uint8Array.from({ length: 256 }, (_, i) => i))].forEach((ch, b) => cp1256.set(ch, b));
    const arabicCsv = ["النسب (بالحروف اللاتينية);الاسم (بالحروف اللاتينية);النسب (بالعربية);الاسم (بالعربية);تاريخ الازدياد;الجنس;القسم",
      "Imp-Idrissi;Salma;الإدريسي;سلمى;19/07/2014;أنثى;IMP-1A"].join("\r\n");
    const bytes = Uint8Array.from([...arabicCsv].map((ch) => cp1256.get(ch) ?? 0x3f));
    const ar = await call("dirA", "previewImport", fileOf(new Blob([bytes], { type: "text/csv" }), "arabe.csv"));
    const row = ar.data?.rows?.[0];
    check("[P5 import] Windows-1256 CSV with Arabic headers: names intact, gender أنثى → female",
      ar.ok && row?.status === "ready" && row.lastNameAr === "الإدريسي" && row.firstNameAr === "سلمى" && row.gender === "female",
      JSON.stringify(row ?? ar.error));

    // .xlsx: a real date cell and a phone Excel turned into a number (leading 0 lost).
    const xlsx = await writeExcelFile([
      ["Last name (Latin)", "First name (Latin)", "Birth date", "Gender (M/F)", "Class", "Parent last name", "Parent first name", "Parent phone", "Relationship"]
        .map((value) => ({ value })),
      [{ value: "Imp-Xlsx" }, { value: "Yasmine" }, { value: new Date(Date.UTC(2014, 6, 19)), type: Date, format: "dd/mm/yyyy" },
        { value: "F" }, { value: "IMP-1A" }, { value: "Imp-Xlsx" }, { value: "Karim" },
        { value: Number(parentPhone.slice(4)), type: Number }, { value: "Father" }],
    ]).toBuffer();
    const x = await call("dirA", "previewImport", fileOf(new Blob([xlsx]), "eleves.xlsx"));
    const xr = x.data?.rows?.[0];
    check("[P5 import] .xlsx: date cell read, numeric phone gets its 0 back",
      x.ok && xr?.status === "ready" && xr.birthDate === "2014-07-19" && xr.parent?.phone === parentPhone,
      JSON.stringify(xr ?? x));

    // File-level problems.
    const fileError = async (label, file, key) => {
      const res = await call("dirA", "previewImport", file);
      check(`[P5 import] ${label} → ${key}`, !res.ok && res.file?.key === key, JSON.stringify(res.file ?? res.error));
      return res;
    };
    const missing = await fileError("no Class / Birth date columns", fileOf(csvBlob(["Nom;Prénom;Sexe", "Imp-A;B;G"]), "a.csv"), "missingColumns");
    check("[P5 import] …names the missing columns", JSON.stringify(missing.file?.columns) === JSON.stringify(["birthDate", "className"]), JSON.stringify(missing.file?.columns));
    await fileError("an old .xls file", fileOf(new Blob(["x"]), "old.xls"), "oldExcel");
    await fileError("a .pdf", fileOf(new Blob(["x"]), "a.pdf"), "unsupportedType");
    await fileError("headers only", fileOf(csvBlob([FR_HEADERS.join(";")]), "a.csv"), "empty");
    await fileError("a broken .xlsx", fileOf(new Blob(["not a zip"]), "a.xlsx"), "unreadable");
    const many = [FR_HEADERS.slice(0, 8).join(";"), ...Array.from({ length: 2001 }, (_, i) => `Imp-M;N${i};;;01/01/2014;G;;IMP-1A`)];
    await fileError("2001 rows", fileOf(csvBlob(many), "many.csv"), "tooManyRows");
  } finally {
    await cleanup(A, s);
  }
}

export async function importCommitActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const s = await setupSchool(A);
  const { call } = context(fx, baseUrl);
  const existing = massar();
  await admin.from("students").insert({ school_id: A.id, first_name: "Old", last_name: "Imp-Old", birth_date: "2013-01-01", gender: "male", code_massar: existing });
  const knownPhone = randomMobile();
  const known = (await admin.from("guardians").insert({ school_id: A.id, last_name: "Imp-Known", first_name: "Parent", phone: knownPhone }).select("id").single()).data;
  const newPhone = randomMobile();
  const m1 = massar();

  try {
    const file = fileOf(csvBlob([
      FR_HEADERS.join(";"),
      `Imp-Alaoui;Rim;العلوي;ريم;02/03/2014;F;${m1};IMP-1A;Imp-Alaoui;Hassan;0${newPhone.slice(4)};Père`,
      `Imp-Alaoui;Omar;;;03/04/2016;G;;IMP-1A;Imp-Alaoui;Hassan;0${newPhone.slice(4)};Père`,
      `Imp-Known;Child;;;01/01/2015;G;;IMP-1A;Whatever;Name;0${knownPhone.slice(4)};Mère`,
      `Imp-Old;Again;;;01/01/2013;G;${existing};IMP-1A;;;;`,
      `Imp-Unticked;Kid;;;01/01/2015;F;;IMP-1A;;;;`,
    ]), "ok.csv");
    const bad = await call("dirA", "commitImport", file, { exclude: "not json" });
    check("[P5 import] a malformed exclude list is refused", !bad.ok && bad.error === "generic", bad.error ?? "ok");
    const r = await call("dirA", "commitImport", file, { exclude: JSON.stringify([6]) });
    check("[P5 import] import of a clean file with line 6 unticked: 3 created, 1 skipped, 1 excluded",
      r.ok && r.data.created === 3 && r.data.skipped === 1 && r.data.excluded === 1, JSON.stringify(r.data ?? r.error));
    const { count: unticked } = await admin.from("students").select("id", { count: "exact", head: true }).eq("school_id", A.id).eq("last_name", "Imp-Unticked");
    check("[P5 import] …the unticked line was not imported", unticked === 0, `${unticked}`);

    const { data: kids } = await admin.from("students")
      .select("first_name, last_name_ar, code_massar, enrollment:student_enrollments(class_id), links:student_guardians(relation, guardian_id)")
      .eq("school_id", A.id).in("last_name", ["Imp-Alaoui", "Imp-Known"]);
    const rim = kids?.find((k) => k.first_name === "Rim");
    const omar = kids?.find((k) => k.first_name === "Omar");
    const child = kids?.find((k) => k.first_name === "Child");
    check("[P5 import] …students saved with Arabic names, Massar code and this year's class",
      rim?.last_name_ar === "العلوي" && rim.code_massar === m1 && rim.enrollment?.[0]?.class_id === s.classId && omar?.enrollment?.[0]?.class_id === s.classId,
      JSON.stringify(rim));
    const { data: newParents } = await admin.from("guardians").select("id").eq("school_id", A.id).eq("phone", newPhone);
    check("[P5 import] …siblings share ONE new parent, linked as father to both",
      newParents?.length === 1 && rim?.links?.[0]?.guardian_id === newParents[0].id && omar?.links?.[0]?.guardian_id === newParents[0].id && rim.links[0].relation === "father",
      JSON.stringify(newParents));
    const { data: knownAfter } = await admin.from("guardians").select("last_name").eq("id", known.id).single();
    check("[P5 import] …an existing parent (same phone) is linked, not renamed",
      child?.links?.[0]?.guardian_id === known.id && child.links[0].relation === "mother" && knownAfter.last_name === "Imp-Known",
      JSON.stringify(child?.links));
    const { count: olds } = await admin.from("students").select("id", { count: "exact", head: true }).eq("code_massar", existing);
    check("[P5 import] …the existing Massar code was not duplicated", olds === 1, `${olds}`);

    const again = await call("dirA", "commitImport", file, { exclude: JSON.stringify([6]) });
    // Only a Massar code identifies a student: rows without one are created again.
    check("[P5 import] importing the same file again skips both known Massar codes",
      again.ok && again.data.skipped === 2 && again.data.created === 2, JSON.stringify(again.data ?? again.error));
  } finally {
    await admin.from("student_guardians").delete().eq("school_id", A.id);
    await cleanup(A, s);
  }
}
