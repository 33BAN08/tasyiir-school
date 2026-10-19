// Phase 9 step 2: the announcement screens and the Server Actions behind them —
// createAnnouncement / updateAnnouncement / deleteAnnouncement /
// markAnnouncementSeen. Staff with announcements.manage post anywhere, a teacher
// only to their own classes (parents), parents only read; the pages show each
// reader only what is for them. Called over HTTP as real users on the page that
// registers each action.
import { randomBytes } from "node:crypto";

import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";
import { randomMobile } from "./phase5-guardians.mjs";

const FILE = "src/lib/announcements/actions.ts";
const NEW_PAGE = "/fr/announcements/new";
const NOT_FOUND = "NEXT_HTTP_ERROR_FALLBACK;404";
const DAY = 86_400_000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);

export async function announcementActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const must = (r, what) => {
    if (r.error) throw new Error(`announcementActions setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (query, what) => must(await query.select("id").single(), what).id;
  const label = (s) => `[P9 announcement actions] ${s}`;

  // --- Setup: current year of A, a teacher with a lesson in c1 only, a parent per class ---------------
  const now = Date.now();
  const today = iso(now);
  const tch = fx.users.tchA.id;
  const { data: tchState } = await admin.from("profiles").select("must_change_password, deactivated_at").eq("id", tch).single();
  await admin.from("profiles").update({ must_change_password: false, deactivated_at: null }).eq("id", tch);

  const { data: before } = await admin.from("academic_years").select("id").eq("school_id", A.id).eq("is_current", true).maybeSingle();
  const { data: existing } = await admin.from("academic_years").select("id")
    .eq("school_id", A.id).lte("start_date", today).gte("end_date", today).maybeSingle();
  const ownYear = !existing;
  const year = existing?.id ?? await id(admin.from("academic_years").insert({
    school_id: A.id, label: "P9-actions", start_date: iso(now - 60 * DAY), end_date: iso(now + 200 * DAY), is_current: false,
  }), "year");
  must(await admin.from("academic_years").update({ is_current: true }).eq("id", year), "current year");

  const { data: monday } = await admin.from("school_days").select("day_of_week").eq("academic_year_id", year).eq("day_of_week", 1).maybeSingle();
  if (!monday) must(await admin.from("school_days").insert({ school_id: A.id, academic_year_id: year, day_of_week: 1 }), "day");
  const slot = await id(admin.from("time_slots").insert({
    school_id: A.id, academic_year_id: year, day_of_week: 1, start_time: "22:40", end_time: "22:50", kind: "lesson",
  }), "slot");
  const level = await id(admin.from("levels").insert({ school_id: A.id, name: "P9a-Niveau", cycle: "college" }), "level");
  const c1 = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name: "P9a-1A" }), "c1");
  const c2 = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: level, name: "P9a-1B" }), "c2");
  const subject = await id(admin.from("subjects").insert({ school_id: A.id, name: "P9a-Maths" }), "subject");
  const dirClient = await signIn(fx.users.dirA);
  must(await dirClient.from("teacher_subjects").insert({ school_id: A.id, teacher_id: tch, subject_id: subject }), "teaches");
  const lesson = await id(admin.from("lessons").insert({
    school_id: A.id, academic_year_id: year, time_slot_id: slot, class_id: c1, subject_id: subject, teacher_id: tch,
  }), "lesson");
  const students = [];
  const guardians = [];

  const parentIn = async (name, klass) => {
    const kid = await id(admin.from("students").insert({ school_id: A.id, first_name: "Kid", last_name: name, birth_date: "2014-01-01", gender: "male" }), name);
    students.push(kid);
    must(await admin.from("student_enrollments").insert({ school_id: A.id, student_id: kid, academic_year_id: year, class_id: klass }), "enrol");
    const email = `rls-test+${fx.run}-${name}@example.com`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), name).user;
    fx.createdUserIds.push(user.id);
    must(await admin.from("profiles").insert({
      id: user.id, school_id: A.id, role_id: A.roles.parent, full_name: `RLS ${name}`, must_change_password: false,
    }), name);
    const g = await id(admin.from("guardians").insert({ school_id: A.id, last_name: name, first_name: "Parent", phone: randomMobile(), profile_id: user.id }), "guardian");
    guardians.push(g);
    must(await admin.from("student_guardians").insert({ school_id: A.id, student_id: kid, guardian_id: g, relation: "father" }), "link");
    return { id: user.id, cookies: await sessionCookies({ email, password }) };
  };
  const p1 = await parentIn("p9apar1", c1);
  const p2 = await parentIn("p9apar2", c2);

  const dir = await sessionCookies(fx.users.dirA);
  const dirB = await sessionCookies(fx.users.dirB);
  const tchCookies = await sessionCookies(fx.users.tchA);

  const call = (cookies, action, path, ...args) => callAction(baseUrl, { id: actionId(FILE, action), path, args, cookies });
  const post = (cookies, input) => call(cookies, "createAnnouncement", NEW_PAGE, input);
  const valid = (extra = {}) => ({
    scope: "school", audience: "parents", title: "P9a Réunion", body: "Réunion\nle lundi à 18h.", levelIds: [], classIds: [], ...extra,
  });
  const row = async (announcement) => (await admin.from("announcements").select("*").eq("id", announcement).maybeSingle()).data;
  const told = async (announcement) =>
    (await admin.from("notifications").select("recipient_id, data, read_at").eq("type", "announcement").filter("data->>announcement_id", "eq", announcement)).data ?? [];
  const get = async (path, cookies) => {
    const res = await fetch(new URL(path, baseUrl), { headers: { cookie: cookies }, redirect: "manual" });
    return { status: res.status, html: res.status === 200 ? await res.text() : "" };
  };

  try {
    // --- Posting ----------------------------------------------------------------------------------------
    const school = await post(dir, valid());
    const schoolRow = school.ok ? await row(school.data.id) : null;
    check(label("the director posts to every parent of the school"), school.ok === true && schoolRow?.scope === "school" && schoolRow.created_by === fx.users.dirA.id, JSON.stringify(school));
    const schoolTold = school.ok ? (await told(school.data.id)).map((n) => n.recipient_id) : [];
    check(label("…both parents are told, the author is not"), schoolTold.includes(p1.id) && schoolTold.includes(p2.id) && !schoolTold.includes(fx.users.dirA.id), String(schoolTold.length));
    const { data: audit } = await admin.from("audit_logs").select("data").eq("school_id", A.id).eq("action", "announcement.create").eq("entity_id", school.data?.id ?? "");
    check(label("…and it is in the audit log"), audit?.length === 1 && audit[0].data?.scope === "school", JSON.stringify(audit));

    const refused = async (name, input, error, field) => {
      const r = await post(dir, input);
      check(label(`refused: ${name}`), r.ok === false && r.error === error && r.field === field, JSON.stringify(r));
    };
    await refused("no title", valid({ title: "   " }), "titleRequired", "title");
    await refused("a 151-character title", valid({ title: "x".repeat(151) }), "titleTooLong", "title");
    await refused("no text", valid({ body: "" }), "bodyRequired", "body");
    await refused("a 5001-character text", valid({ body: "x".repeat(5001) }), "bodyTooLong", "body");
    await refused("levels without a level", valid({ scope: "levels" }), "levelsRequired", "levelIds");
    await refused("classes without a class", valid({ scope: "classes" }), "classesRequired", "classIds");
    await refused("staff audience on classes", valid({ scope: "classes", audience: "staff", classIds: [c1] }), "invalid", "audience");
    await refused("an unknown scope", valid({ scope: "world" }), "invalid", "scope");
    const garbage = await post(dir, "not an object");
    check(label("refused: not an object"), garbage.ok === false && garbage.error === "invalid", JSON.stringify(garbage));

    const levels = await post(dir, valid({ scope: "levels", title: "P9a Niveau", levelIds: [level] }));
    check(label("the director posts to a level"), levels.ok === true && (await row(levels.data.id))?.scope === "levels", JSON.stringify(levels));
    const staffOnly = await post(dir, valid({ audience: "staff", title: "P9a Personnel" }));
    check(label("the director posts to the staff only"), staffOnly.ok === true && !(await told(staffOnly.data.id)).some((n) => n.recipient_id === p1.id), JSON.stringify(staffOnly));

    // A teacher: only the parents of classes they teach.
    const own = await post(tchCookies, valid({ scope: "classes", title: "P9a Sortie", classIds: [c1] }));
    const ownTold = own.ok ? (await told(own.data.id)).map((n) => n.recipient_id) : [];
    check(label("a teacher posts to a class they teach"), own.ok === true && ownTold.includes(p1.id) && !ownTold.includes(p2.id), JSON.stringify(own));
    const other = await post(tchCookies, valid({ scope: "classes", title: "P9a Autre", classIds: [c2] }));
    check(label("a teacher cannot post to a class they do not teach"), other.ok === false && other.error === "forbidden", JSON.stringify(other));
    const wide = await post(tchCookies, valid({ title: "P9a Ecole" }));
    check(label("a teacher cannot post to the whole school"), wide.ok === false && wide.error === "forbidden", JSON.stringify(wide));
    const byParent = await post(p1.cookies, valid());
    check(label("a parent cannot post"), byParent.ok === false && byParent.error === "forbidden", JSON.stringify(byParent));
    const out = await post(undefined, valid());
    check(label("signed out: refused"), out.ok === false, JSON.stringify(out));

    // --- Edit ---------------------------------------------------------------------------------------------
    const ownPage = `/fr/announcements/${own.data.id}`;
    const edit = (cookies, announcement, input, path = ownPage) => call(cookies, "updateAnnouncement", path, announcement, input);
    const edited = await edit(tchCookies, own.data.id, { title: "P9a Sortie (modifiée)", body: "Nouveau texte." });
    check(label("the author edits their announcement"), edited.ok === true && (await row(own.data.id)).title === "P9a Sortie (modifiée)" && (await row(own.data.id)).updated_by === tch, JSON.stringify(edited));
    check(label("…the notification shows the new title"), (await told(own.data.id)).every((n) => n.data.title === "P9a Sortie (modifiée)"));
    check(label("…who it goes to did not change"), (await row(own.data.id)).scope === "classes" && (await told(own.data.id)).length === ownTold.length);
    const notMine = await edit(tchCookies, school.data.id, { title: "Piraté", body: "x" });
    check(label("a teacher cannot edit the director's announcement"), notMine.ok === false && notMine.error === "notFound" && (await row(school.data.id)).title === "P9a Réunion", JSON.stringify(notMine));
    const byDirector = await edit(dir, own.data.id, { title: "P9a Sortie (direction)", body: "Texte de la direction." });
    check(label("the director edits a teacher's announcement"), byDirector.ok === true && (await row(own.data.id)).updated_by === fx.users.dirA.id, JSON.stringify(byDirector));
    const parentEdit = await edit(p1.cookies, own.data.id, { title: "Piraté", body: "x" });
    check(label("a parent cannot edit"), parentEdit.ok === false, JSON.stringify(parentEdit));
    const emptyTitle = await edit(dir, own.data.id, { title: "", body: "x" });
    check(label("refused: an empty title on edit"), emptyTitle.ok === false && emptyTitle.error === "titleRequired" && emptyTitle.field === "title", JSON.stringify(emptyTitle));
    const bId = "00000000-0000-4000-8000-000000000000";
    const gone = await edit(dir, bId, { title: "x", body: "x" });
    check(label("refused: an unknown announcement"), gone.ok === false && gone.error === "notFound", JSON.stringify(gone));
    const crossSchool = await edit(dirB, school.data.id, { title: "Piraté", body: "x" }, `/fr/announcements/${school.data.id}`);
    check(label("the director of school B cannot edit A's announcement"), crossSchool.ok === false && (await row(school.data.id)).title === "P9a Réunion", JSON.stringify(crossSchool));

    // --- Pages ----------------------------------------------------------------------------------------------
    const parentList = await get("/fr/portal/announcements", p1.cookies);
    check(label("parent 1 sees the whole-school and the class announcement, not the staff one"),
      parentList.status === 200 && parentList.html.includes("P9a Réunion") && parentList.html.includes("P9a Sortie (direction)") && !parentList.html.includes("P9a Personnel"),
      String(parentList.status));
    const parent2List = await get("/fr/portal/announcements", p2.cookies);
    check(label("parent 2 does not see class 1's announcement"), parent2List.status === 200 && parent2List.html.includes("P9a Réunion") && !parent2List.html.includes("P9a Sortie"), String(parent2List.status));
    const parentDetail = await get(`/fr/portal/announcements/${own.data.id}`, p1.cookies);
    check(label("parent 1 opens it, with its text and no edit button"), parentDetail.status === 200 && parentDetail.html.includes("Texte de la direction.") && !/Supprimer<\/button>/.test(parentDetail.html), String(parentDetail.status));
    const parent2Detail = await get(`/fr/portal/announcements/${own.data.id}`, p2.cookies);
    check(label("parent 2 gets not found for it"), parent2Detail.status !== 200 || parent2Detail.html.includes(NOT_FOUND), String(parent2Detail.status));
    const staffDetail = await get(`/fr/announcements/${own.data.id}`, dir);
    check(label("the director opens it and can edit / delete"), staffDetail.status === 200 && staffDetail.html.includes("Texte de la direction.") && /Supprimer<\/button>/.test(staffDetail.html), String(staffDetail.status));
    const tchDetail = await get(`/fr/announcements/${school.data.id}`, tchCookies);
    check(label("a teacher does not see the director's parents-only announcement"), tchDetail.status !== 200 || tchDetail.html.includes(NOT_FOUND), String(tchDetail.status));
    const tchList = await get("/fr/announcements", tchCookies);
    check(label("the teacher's list holds their own post"), tchList.status === 200 && tchList.html.includes("P9a Sortie (direction)") && !tchList.html.includes("P9a Réunion"), String(tchList.status));
    const bList = await get("/fr/announcements", dirB);
    check(label("school B's list shows nothing of school A"), bList.status === 200 && !bList.html.includes("P9a "), String(bList.status));
    const parentStaffPage = await get("/fr/announcements", p1.cookies);
    check(label("a parent opening /announcements is sent to their own area"),
      parentStaffPage.status !== 200 || /NEXT_REDIRECT;replace;[^"]*\/portal/.test(parentStaffPage.html) || !parentStaffPage.html.includes("P9a Réunion"), String(parentStaffPage.status));
    const newForDir = await get(NEW_PAGE, dir);
    check(label("the director gets the form"), newForDir.status === 200 && newForDir.html.includes('id="field-title"'), String(newForDir.status));
    const newForTch = await get(NEW_PAGE, tchCookies);
    check(label("a teacher gets the form with their class only"), newForTch.status === 200 && newForTch.html.includes('id="field-title"') && newForTch.html.includes("P9a-1A") && !newForTch.html.includes("P9a-1B"), String(newForTch.status));
    const newForParent = await get(NEW_PAGE, p1.cookies);
    check(label("a parent gets no form"), newForParent.status !== 200 || !newForParent.html.includes('id="field-title"'), String(newForParent.status));

    // --- Opening it reads its notification ---------------------------------------------------------------------
    const seen = await call(p1.cookies, "markAnnouncementSeen", `/fr/portal/announcements/${school.data.id}`, school.data.id);
    void seen;
    const after = await told(school.data.id);
    check(label("opening reads the notification of that parent only"),
      after.find((n) => n.recipient_id === p1.id)?.read_at && !after.find((n) => n.recipient_id === p2.id)?.read_at, JSON.stringify(after.map((n) => !!n.read_at)));

    // --- Delete ----------------------------------------------------------------------------------------------------
    const del = (cookies, announcement, path) => call(cookies, "deleteAnnouncement", path, announcement);
    const notMineDel = await del(tchCookies, school.data.id, `/fr/announcements/${school.data.id}`);
    check(label("a teacher cannot delete the director's announcement"), notMineDel.ok === false && (await row(school.data.id)) !== null, JSON.stringify(notMineDel));
    const parentDel = await del(p1.cookies, own.data.id, ownPage);
    check(label("a parent cannot delete"), parentDel.ok === false && (await row(own.data.id)) !== null, JSON.stringify(parentDel));
    const crossDel = await del(dirB, own.data.id, ownPage);
    check(label("the director of school B cannot delete A's announcement"), crossDel.ok === false && (await row(own.data.id)) !== null, JSON.stringify(crossDel));
    const ownDel = await del(tchCookies, own.data.id, ownPage);
    check(label("the author deletes their announcement, its notifications go"), ownDel.ok === true && (await row(own.data.id)) === null && (await told(own.data.id)).length === 0, JSON.stringify(ownDel));
    const dirDel = await del(dir, school.data.id, `/fr/announcements/${school.data.id}`);
    check(label("the director deletes any announcement"), dirDel.ok === true && (await row(school.data.id)) === null, JSON.stringify(dirDel));
    const again = await del(dir, school.data.id, `/fr/announcements/${school.data.id}`);
    check(label("deleting it again says not found"), again.ok === false && again.error === "notFound", JSON.stringify(again));
  } finally {
    await admin.from("announcements").delete().eq("school_id", A.id).like("title", "P9a %");
    await admin.from("notifications").delete().eq("school_id", A.id).eq("type", "announcement");
    await admin.from("student_guardians").delete().in("student_id", students);
    await admin.from("guardians").delete().in("id", guardians);
    await admin.from("students").delete().in("id", students);
    await admin.from("lessons").delete().eq("id", lesson);
    await admin.from("teacher_subjects").delete().eq("subject_id", subject);
    await admin.from("classes").delete().in("id", [c1, c2]);
    await admin.from("time_slots").delete().eq("id", slot);
    if (!monday) await admin.from("school_days").delete().eq("academic_year_id", year).eq("day_of_week", 1);
    await admin.from("levels").delete().eq("id", level);
    await admin.from("subjects").delete().eq("id", subject);
    if (before && before.id !== year) await admin.from("academic_years").update({ is_current: true }).eq("id", before.id);
    else if (!before) await admin.from("academic_years").update({ is_current: false }).eq("id", year);
    if (ownYear) await admin.from("academic_years").delete().eq("id", year);
    await admin.from("profiles").update({ must_change_password: tchState.must_change_password, deactivated_at: tchState.deactivated_at }).eq("id", tch);
  }
}
