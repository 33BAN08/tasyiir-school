// Phase 6 step 7: the print page (/print/timetable), fetched over HTTP as
// real users. One A4 landscape sheet per class / teacher / room (school name,
// whose week, year); `all=1` = every one with lessons. Timetable staff print
// any week of their school; a teacher only their own; parents and other
// schools get nothing.
import { sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";

export async function timetablePrintPages({ fx, baseUrl }) {
  const A = fx.schools.a;
  const tch = fx.users.tchA.id;
  const id = async (query) => (await query.select("id").single()).data.id;
  const page = async (cookies, path) => {
    const res = await fetch(new URL(path, baseUrl), { headers: { cookie: cookies }, redirect: "manual" });
    const html = res.status === 200 ? await res.text() : "";
    const streamed = html.match(/NEXT_REDIRECT;\w+;([^;]+);/)?.[1];
    return { status: res.status, redirect: streamed ?? res.headers.get("location") ?? "", html: streamed ? "" : html };
  };
  const sheets = (html) => (html.match(/data-print-sheet="/g) ?? []).length;

  const { data: tchState } = await admin.from("profiles").select("must_change_password, deactivated_at").eq("id", tch).single();
  await admin.from("profiles").update({ must_change_password: false, deactivated_at: null }).eq("id", tch);
  const { data: school } = await admin.from("schools").select("name").eq("id", A.id).single();

  // A CURRENT year (2053: the teacher prints the current year) with Monday 08:00 / 09:00, three classes (one without lessons), two teachers.
  const currentBefore = (await admin.from("academic_years").select("id").eq("school_id", A.id).eq("is_current", true).maybeSingle()).data?.id;
  const year = await id(admin.from("academic_years").insert({
    school_id: A.id, label: "2053-2054", start_date: "2053-09-01", end_date: "2054-06-30", is_current: true,
  }));
  await admin.from("school_days").insert({ school_id: A.id, academic_year_id: year, day_of_week: 1 });
  const slot = (start, end) => id(admin.from("time_slots").insert({
    school_id: A.id, academic_year_id: year, day_of_week: 1, start_time: start, end_time: end, kind: "lesson",
  }));
  const s8 = await slot("08:00", "09:00");
  const s9 = await slot("09:00", "10:00");
  const level = await id(admin.from("levels").insert({ school_id: A.id, name: "LQ-Niveau", cycle: "college" }));
  const klass = (name) => id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name }));
  const c1 = await klass("LQ-1");
  const c2 = await klass("LQ-2");
  await klass("LQ-3"); // no lessons: never printed with all=1
  const arabe = await id(admin.from("subjects").insert({ school_id: A.id, name: "LQ-Arabe" }));
  const maths = await id(admin.from("subjects").insert({ school_id: A.id, name: "LQ-Maths" }));
  const email = `rls-test+${fx.run}-lqtch2@example.com`;
  const { data: created } = await admin.auth.admin.createUser({ email, password: `${crypto.randomUUID()}Aa1`, email_confirm: true });
  const tch2 = created.user.id;
  fx.createdUserIds.push(tch2);
  await admin.from("profiles").insert({ id: tch2, school_id: A.id, role_id: A.roles.teacher, full_name: "RLS lqtch2", email, must_change_password: false });
  const dirA = await signIn(fx.users.dirA);
  await dirA.from("teacher_subjects").insert([
    { school_id: A.id, teacher_id: tch, subject_id: arabe },
    { school_id: A.id, teacher_id: tch2, subject_id: maths },
  ]);
  const lesson = (classId, slotId, subjectId, teacherId) => admin.from("lessons").insert({
    school_id: A.id, academic_year_id: year, time_slot_id: slotId, class_id: classId, subject_id: subjectId, teacher_id: teacherId,
  });
  await lesson(c1, s8, arabe, tch);
  await lesson(c2, s9, maths, tch2);

  const cookies = {
    dirA: await sessionCookies(fx.users.dirA),
    tchA: await sessionCookies(fx.users.tchA),
    dirB: await sessionCookies(fx.users.dirB),
  };
  const base = `/fr/print/timetable?year=${year}`;

  // --- Staff ----------------------------------------------------------------------------------
  const one = await page(cookies.dirA, `${base}&view=class&id=${c1}`);
  check("[P6 print] director prints a class: one sheet", one.status === 200 && sheets(one.html) === 1, `${one.status} ${sheets(one.html)}`);
  check("[P6 print] …school name, class, year and its lesson",
    one.html.includes(school.name) && one.html.includes("Classe LQ-1") && one.html.includes("2053-2054") && one.html.includes("LQ-Arabe"));
  check("[P6 print] …A4 landscape", one.html.includes("size: A4 landscape"));
  const all = await page(cookies.dirA, `${base}&view=class&all=1`);
  check("[P6 print] all classes: one sheet per class WITH lessons (2 of 3)", sheets(all.html) === 2, String(sheets(all.html)));
  const teachers = await page(cookies.dirA, `${base}&view=teacher&all=1`);
  check("[P6 print] all teachers: one sheet each", sheets(teachers.html) === 2 && teachers.html.includes("RLS lqtch2"), String(sheets(teachers.html)));
  const ar = await page(cookies.dirA, `/ar/print/timetable?year=${year}&view=class&id=${c1}`);
  check("[P6 print] Arabic sheet is right-to-left", ar.html.includes('dir="rtl"') && ar.html.includes("القسم LQ-1"));

  // --- Teacher: only their own week -----------------------------------------------------------
  const own = await page(cookies.tchA, `${base}&view=class&id=${c2}&all=1`);
  check("[P6 print] teacher asking for another class / all → only their own week",
    sheets(own.html) === 1 && own.html.includes("LQ-Arabe") && !own.html.includes("LQ-Maths") && !own.html.includes("RLS lqtch2"),
    String(sheets(own.html)));

  // --- Others ---------------------------------------------------------------------------------
  const other = await page(cookies.dirB, `${base}&view=class&id=${c1}`);
  check("[P6 print] another school's director sees nothing of school A",
    !other.html.includes("LQ-Arabe") && !other.html.includes("LQ-1"), String(other.status));
  const anon = await page("", `${base}&view=class&id=${c1}`);
  check("[P6 print] signed out → login", anon.redirect.includes("/login"), `${anon.status} ${anon.redirect}`);

  // Clean up.
  await admin.from("lessons").delete().eq("academic_year_id", year);
  await admin.from("teacher_subjects").delete().in("subject_id", [arabe, maths]);
  await admin.from("classes").delete().eq("academic_year_id", year);
  await admin.from("academic_years").delete().eq("id", year);
  if (currentBefore) await admin.from("academic_years").update({ is_current: true }).eq("id", currentBefore);
  await admin.from("levels").delete().eq("id", level);
  await admin.from("subjects").delete().in("id", [arabe, maths]);
  await admin.from("profiles").update(tchState).eq("id", tch);
}
