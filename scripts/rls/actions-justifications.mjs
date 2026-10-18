// Phase 7 step 5: a parent's absences page (/portal/absences) and the Server
// Actions behind it — submitJustification (whole days + optional note),
// cancelJustification (own pending only), getJustificationFileUrl (who can
// read the justification). Called over HTTP as real users on the page that
// registers them.
import { randomBytes, randomUUID } from "node:crypto";

import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";
import { randomMobile } from "./phase5-guardians.mjs";

const FILE = "src/lib/justifications/actions.ts";
const BUCKET = "justifications";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const DAY = 86_400_000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const isoDow = (t) => ((new Date(t).getUTCDay() + 6) % 7) + 1;

export async function justificationActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const id = async (query) => (await query.select("id").single()).data.id;
  const now = Date.now(); // Morocco is UTC+0: the UTC date is the school's date
  let pastTime = now - DAY;
  while (isoDow(pastTime) === 7) pastTime -= DAY;
  const past = iso(pastTime);
  const today = iso(now);
  const dow = isoDow(pastTime);

  // --- Two parents, two kids in one class, kid1 absent on a past day -------------------------
  const parent = async (name) => {
    const email = `rls-test+${fx.run}-${name}@example.com`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    fx.createdUserIds.push(data.user.id);
    await admin.from("profiles").insert({ id: data.user.id, school_id: A.id, role_id: A.roles.parent, full_name: `RLS ${name}`, must_change_password: false });
    const user = { id: data.user.id, email, password };
    return { ...user, client: await signIn(user), cookies: await sessionCookies(user) };
  };
  const par1 = await parent("jaspar1");
  const par2 = await parent("jaspar2");
  const survCookies = await sessionCookies(fx.users.survA);

  const { data: existing } = await admin.from("academic_years").select("id").eq("school_id", A.id)
    .lte("start_date", past).gte("end_date", today).maybeSingle();
  const ownYear = !existing;
  const year = existing?.id ?? await id(admin.from("academic_years").insert({
    school_id: A.id, label: "JA-annee", start_date: iso(now - 60 * DAY), end_date: iso(now + 200 * DAY), is_current: false,
  }));
  const { data: dayRow } = await admin.from("school_days").select("day_of_week").eq("academic_year_id", year).eq("day_of_week", dow).maybeSingle();
  if (!dayRow) await admin.from("school_days").insert({ school_id: A.id, academic_year_id: year, day_of_week: dow });
  const slot = await id(admin.from("time_slots").insert({
    school_id: A.id, academic_year_id: year, day_of_week: dow, start_time: "22:30", end_time: "23:00", kind: "lesson",
  }));
  const level = await id(admin.from("levels").insert({ school_id: A.id, name: "JA-Niveau", cycle: "college" }));
  const klass = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name: "JA-1" }));
  const subject = await id(admin.from("subjects").insert({ school_id: A.id, name: "JA-Arabe" }));
  await (await signIn(fx.users.dirA)).from("teacher_subjects").insert({ school_id: A.id, teacher_id: fx.users.tchA.id, subject_id: subject });
  const lesson = await id(admin.from("lessons").insert({
    school_id: A.id, academic_year_id: year, time_slot_id: slot, class_id: klass, subject_id: subject, teacher_id: fx.users.tchA.id,
  }));
  const kid = async (name) => {
    const s = await id(admin.from("students").insert({ school_id: A.id, first_name: "Kid", last_name: name, birth_date: "2014-01-01", gender: "male" }));
    await admin.from("student_enrollments").insert({ school_id: A.id, student_id: s, academic_year_id: year, class_id: klass });
    return s;
  };
  const kid1 = await kid("JASKIDONE");
  const kid2 = await kid("JASKIDTWO");
  for (const [par, k] of [[par1, kid1], [par2, kid2]]) {
    const g = await id(admin.from("guardians").insert({ school_id: A.id, last_name: "JA", first_name: "Parent", phone: randomMobile(), profile_id: par.id }));
    await admin.from("student_guardians").insert({ school_id: A.id, student_id: k, guardian_id: g, relation: "father" });
  }
  const survA = await signIn(fx.users.survA);
  const saved = await survA.rpc("save_attendance", { p_lesson: lesson, p_date: past, p_marks: [{ student_id: kid1, status: "absent" }] });
  if (saved.error) throw new Error(`actionsJustifications setup: attendance (${saved.error.code})`);

  const PAGE = `/fr/portal/absences?child=${kid1}`;
  const call = (cookies, action, ...args) => callAction(baseUrl, { id: actionId(FILE, action), path: PAGE, args, cookies });
  const expect = async (label, promise, wanted, field) => {
    const r = await promise;
    const got = r.ok ? "ok" : r.error;
    check(`[P7 parent] ${label}`, got === wanted && (field === undefined || r.field === field), field ? `${got} (${r.field})` : got);
    return r;
  };
  const exists = async (path) => {
    const folder = path.slice(0, path.lastIndexOf("/"));
    const { data } = await admin.storage.from(BUCKET).list(folder);
    return (data ?? []).some((o) => `${folder}/${o.name}` === path);
  };
  const upload = async (path) => (await par1.client.storage.from(BUCKET).upload(path, PNG, { contentType: "image/png" })).error;
  const form = (extra = {}) => ({ fromDate: past, toDate: past, reason: "Rendez-vous médical", ...extra });
  const pageOf = async (cookies, path = PAGE) => {
    const res = await fetch(new URL(path, baseUrl), { headers: { Cookie: cookies }, redirect: "manual" });
    return { status: res.status, html: await res.text() };
  };

  // The page: the child's absence is listed, nothing justified yet.
  let page = await pageOf(par1.cookies);
  check("[P7 parent] the page lists the child's absence, not justified yet",
    page.status === 200 && page.html.includes('data-state="none"') && !page.html.includes('data-state="justified"'), `status ${page.status}`);

  // --- Sending ---------------------------------------------------------------------------------
  await expect("a parent sends a justification (no file)", call(par1.cookies, "submitJustification", kid1, form(), null), "ok");
  const { data: sent } = await admin.from("justifications").select("id, status, kind, submitted_by, school_id, file_path").eq("student_id", kid1).single();
  check("[P7 parent] …saved as pending 'days', by the parent, in their school",
    sent?.status === "pending" && sent?.kind === "days" && sent?.submitted_by === par1.id && sent?.school_id === A.id, JSON.stringify(sent));
  const { data: audit } = await admin.from("audit_logs").select("action").eq("entity_id", sent?.id).eq("action", "justification.submit");
  check("[P7 parent] …and audited", (audit ?? []).length === 1);
  page = await pageOf(par1.cookies);
  check("[P7 parent] a pending justification shows on the absence (not justified)",
    page.html.includes('data-state="pending"') && !page.html.includes('data-state="justified"'));

  await expect("another family's child → forbidden", call(par1.cookies, "submitJustification", kid2, form(), null), "forbidden");
  await expect("staff cannot use the parent form", call(survCookies, "submitJustification", kid1, form(), null), "forbidden");
  await expect("an empty reason → reasonRequired", call(par1.cookies, "submitJustification", kid1, form({ reason: "  " }), null), "reasonRequired", "reason");
  await expect("a reason over 500 characters → tooLong", call(par1.cookies, "submitJustification", kid1, form({ reason: "x".repeat(501) }), null), "tooLong", "reason");
  await expect("last day before the first → endBeforeStart", call(par1.cookies, "submitJustification", kid1, form({ toDate: iso(pastTime - DAY) }), null), "endBeforeStart", "toDate");
  await expect("over 31 days → tooManyDays", call(par1.cookies, "submitJustification", kid1, form({ fromDate: iso(pastTime - 31 * DAY) }), null), "tooManyDays", "toDate");
  await expect("more than a year back → tooOld", call(par1.cookies, "submitJustification", kid1, form({ fromDate: iso(now - 400 * DAY), toDate: iso(now - 400 * DAY) }), null), "tooOld", "fromDate");
  await expect("more than 30 days ahead → tooFarAhead", call(par1.cookies, "submitJustification", kid1, form({ fromDate: iso(now + 40 * DAY), toDate: iso(now + 40 * DAY) }), null), "tooFarAhead", "toDate");
  await expect("a malformed date → invalidDate", call(par1.cookies, "submitJustification", kid1, form({ fromDate: "hier" }), null), "invalidDate", "fromDate");

  // --- The note ---------------------------------------------------------------------------------
  const file1 = `${A.id}/${kid1}/${randomUUID()}.png`;
  check("[P7 parent] the parent uploads a note", !(await upload(file1)));
  await expect("…and sends it with the justification", call(par1.cookies, "submitJustification", kid1, form({ reason: "Certificat" }), file1), "ok");
  const withFile = (await admin.from("justifications").select("id").eq("file_path", file1).single()).data?.id;

  const file2 = `${A.id}/${kid1}/${randomUUID()}.png`;
  await upload(file2);
  await expect("a failed sending (empty reason) removes the uploaded note",
    call(par1.cookies, "submitJustification", kid1, form({ reason: "" }), file2), "reasonRequired", "reason");
  check("[P7 parent] …the file is gone", !(await exists(file2)));

  const otherKidFile = `${A.id}/${kid2}/${randomUUID()}.png`;
  await expect("a note path of another child → fileUpload", call(par1.cookies, "submitJustification", kid1, form(), otherKidFile), "fileUpload");
  await expect("a note that was never uploaded → fileUpload", call(par1.cookies, "submitJustification", kid1, form(), `${A.id}/${kid1}/${randomUUID()}.png`), "fileUpload");

  // --- Reading the note --------------------------------------------------------------------------
  const url = await expect("the parent gets a link to their note", call(par1.cookies, "getJustificationFileUrl", withFile), "ok");
  const fetched = url.ok ? await fetch(url.data.url) : null;
  check("[P7 parent] …and the link opens the file", fetched?.status === 200 && fetched.headers.get("content-type")?.startsWith("image/"), `status ${fetched?.status}`);
  await expect("staff (attendance.view) get one too", call(survCookies, "getJustificationFileUrl", withFile), "ok");
  await expect("another family's parent → notFound", call(par2.cookies, "getJustificationFileUrl", withFile), "notFound");
  await expect("a justification without a note → notFound", call(par1.cookies, "getJustificationFileUrl", sent?.id), "notFound");
  await expect("a malformed id → notFound", call(par1.cookies, "getJustificationFileUrl", "nope"), "notFound");

  // --- Withdrawing -------------------------------------------------------------------------------
  await expect("another family's parent cannot withdraw it", call(par2.cookies, "cancelJustification", withFile), "notPending");
  check("[P7 parent] …it is still there", (await admin.from("justifications").select("id").eq("id", withFile)).data?.length === 1);
  await expect("staff cannot use the parent's withdraw", call(survCookies, "cancelJustification", withFile), "forbidden");
  await expect("the parent withdraws their pending justification", call(par1.cookies, "cancelJustification", withFile), "ok");
  check("[P7 parent] …the row and its note are gone",
    (await admin.from("justifications").select("id").eq("id", withFile)).data?.length === 0 && !(await exists(file1)));

  // --- Reviewed: justified on the page, cannot be withdrawn ---------------------------------------
  await survA.from("justifications").update({ status: "approved" }).eq("id", sent?.id);
  await expect("an approved justification cannot be withdrawn", call(par1.cookies, "cancelJustification", sent?.id), "notPending");
  page = await pageOf(par1.cookies);
  check("[P7 parent] an approved justification marks the absence as justified", page.html.includes('data-state="justified"'));
  await survA.from("justifications").update({ status: "rejected", review_note: "Illisible" }).eq("id", sent?.id);
  page = await pageOf(par1.cookies);
  check("[P7 parent] a rejected one justifies nothing", page.html.includes('data-state="rejected"') && !page.html.includes('data-state="justified"'));

  // --- Privacy ----------------------------------------------------------------------------------
  page = await pageOf(par2.cookies, `/fr/portal/absences?child=${kid1}`);
  check("[P7 parent] another parent asking for this child sees only their own",
    page.status === 200 && !page.html.includes("JASKIDONE") && !page.html.includes('data-state="rejected"'), `status ${page.status}`);
  const staffPage = await pageOf(survCookies, "/fr/portal/absences");
  // A redirect during streaming answers 200 with NEXT_REDIRECT in the payload.
  check("[P7 parent] staff are sent away from the parent page", staffPage.status >= 300 || staffPage.html.includes("NEXT_REDIRECT;replace;/fr/dashboard"), `status ${staffPage.status}`);

  // --- Clean up ------------------------------------------------------------------------------------
  const { data: left } = await admin.storage.from(BUCKET).list(`${A.id}/${kid1}`);
  if (left?.length) await admin.storage.from(BUCKET).remove(left.map((o) => `${A.id}/${kid1}/${o.name}`));
  await admin.from("justifications").delete().in("student_id", [kid1, kid2]);
  await admin.from("attendance_sessions").delete().eq("class_id", klass);
  await admin.from("student_guardians").delete().in("student_id", [kid1, kid2]);
  await admin.from("guardians").delete().in("profile_id", [par1.id, par2.id]);
  await admin.from("student_enrollments").delete().in("student_id", [kid1, kid2]);
  await admin.from("students").delete().in("id", [kid1, kid2]);
  await admin.from("lessons").delete().eq("id", lesson);
  await admin.from("teacher_subjects").delete().eq("subject_id", subject);
  await admin.from("classes").delete().eq("id", klass);
  await admin.from("time_slots").delete().eq("id", slot);
  if (!dayRow) await admin.from("school_days").delete().eq("academic_year_id", year).eq("day_of_week", dow);
  if (ownYear) await admin.from("academic_years").delete().eq("id", year);
  await admin.from("levels").delete().eq("id", level);
  await admin.from("subjects").delete().eq("id", subject);
}
