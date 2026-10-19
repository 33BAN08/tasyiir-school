// Phase 9 step 1: announcements. Who may post what (announcements.manage =
// any scope / audience; a teacher = the parents of classes they teach this
// year), who is told and who may read (the same rule), edit / delete rights,
// targets fixed once posted, the messaging module, and school B seeing nothing.
import { randomBytes } from "node:crypto";

import { check, denied, rows, skip } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";
import { randomMobile } from "./phase5-guardians.mjs";

const DAY = 86_400_000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);

export async function phase9Announcements({ fx, as }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const { dirA, survA, tchA, audA, dirB, anon } = as;
  const must = (r, what) => {
    if (r.error) throw new Error(`phase9Announcements setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const id = async (query, what) => must(await query.select("id").single(), what).id;
  const label = (s) => `[P9 announcements] ${s}`;
  // Refused with this error code or message.
  const refused = async (name, query, wanted) => {
    const { error } = await query;
    const pass = Boolean(error) && (error.code === wanted || error.message?.includes(wanted));
    check(label(name), pass, error ? `${error.code} ${error.message}` : "ACCEPTED!");
  };
  const post = (client, scope, audience, extra = {}) =>
    client.rpc("create_announcement", {
      p_scope: scope, p_audience: audience,
      p_title: extra.title ?? `P9 ${scope} ${audience}`, p_body: extra.body ?? "Texte de l'annonce.",
      p_level_ids: extra.levels ?? [], p_class_ids: extra.classes ?? [],
    });
  const told = async (announcement) => {
    const { data } = await admin.from("notifications").select("recipient_id, data")
      .eq("type", "announcement").filter("data->>announcement_id", "eq", announcement);
    return data ?? [];
  };
  const sameSet = (list, ids) => list.length === ids.length && ids.every((x) => list.includes(x));

  const now = Date.now();
  const today = iso(now);

  // --- Accounts ----------------------------------------------------------------------------------
  const account = async (name, school, roleKey, mustChange = false) => {
    const email = `rls-test+${fx.run}-${name}@example.com`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), name).user;
    fx.createdUserIds.push(user.id);
    must(await admin.from("profiles").insert({
      id: user.id, school_id: school.id, role_id: school.roles[roleKey], full_name: `RLS ${name}`,
      email: roleKey === "parent" ? null : email, must_change_password: mustChange,
    }), name);
    return { id: user.id, client: await signIn({ email, password }) };
  };
  const tch = fx.users.tchA.id;
  const { data: tchState } = await admin.from("profiles").select("must_change_password, deactivated_at").eq("id", tch).single();
  await admin.from("profiles").update({ must_change_password: false, deactivated_at: null }).eq("id", tch);
  const tch2 = await account("p9tch2", A, "teacher");

  // --- School A: the CURRENT year containing today (put back as it was at the end) --------------
  const { data: before } = await admin.from("academic_years").select("id").eq("school_id", A.id).eq("is_current", true).maybeSingle();
  const { data: existing } = await admin.from("academic_years").select("id")
    .eq("school_id", A.id).lte("start_date", today).gte("end_date", today).maybeSingle();
  const ownYear = !existing;
  const year = existing?.id ?? await id(admin.from("academic_years").insert({
    school_id: A.id, label: "P9-annee", start_date: iso(now - 60 * DAY), end_date: iso(now + 200 * DAY), is_current: false,
  }), "year");
  must(await admin.from("academic_years").update({ is_current: true }).eq("id", year), "current year");

  const { data: monday } = await admin.from("school_days").select("day_of_week").eq("academic_year_id", year).eq("day_of_week", 1).maybeSingle();
  if (!monday) must(await admin.from("school_days").insert({ school_id: A.id, academic_year_id: year, day_of_week: 1 }), "day");
  const slot = await id(admin.from("time_slots").insert({
    school_id: A.id, academic_year_id: year, day_of_week: 1, start_time: "22:00", end_time: "22:30", kind: "lesson",
  }), "slot");
  const L1 = await id(admin.from("levels").insert({ school_id: A.id, name: "P9-Niveau-1", cycle: "college" }), "L1");
  const L2 = await id(admin.from("levels").insert({ school_id: A.id, name: "P9-Niveau-2", cycle: "college" }), "L2");
  const c1 = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: L1, name: "P9-1A" }), "c1");
  const c2 = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: L1, name: "P9-1B" }), "c2");
  const c3 = await id(admin.from("classes").insert({ school_id: A.id, academic_year_id: year, level_id: L2, name: "P9-2A" }), "c3");
  const subject = await id(admin.from("subjects").insert({ school_id: A.id, name: "P9-Maths" }), "subject");
  must(await dirA.from("teacher_subjects").insert({ school_id: A.id, teacher_id: tch, subject_id: subject }), "teaches");
  const lesson = await id(admin.from("lessons").insert({
    school_id: A.id, academic_year_id: year, time_slot_id: slot, class_id: c1, subject_id: subject, teacher_id: tch,
  }), "lesson");

  // A parent account per class (+ one who has not set their own password, child in c1).
  const students = [];
  const guardians = [];
  const parentIn = async (name, klass, mustChange = false) => {
    const kid = await id(admin.from("students").insert({ school_id: A.id, first_name: "Kid", last_name: name, birth_date: "2014-01-01", gender: "male" }), name);
    students.push(kid);
    must(await admin.from("student_enrollments").insert({ school_id: A.id, student_id: kid, academic_year_id: year, class_id: klass }), "enrol");
    const par = await account(name, A, "parent", mustChange);
    const g = await id(admin.from("guardians").insert({ school_id: A.id, last_name: name, first_name: "Parent", phone: randomMobile(), profile_id: par.id }), "guardian");
    guardians.push(g);
    must(await admin.from("student_guardians").insert({ school_id: A.id, student_id: kid, guardian_id: g, relation: "father" }), "link");
    return par;
  };
  const p1 = await parentIn("p9par1", c1);
  const p2 = await parentIn("p9par2", c2);
  const p3 = await parentIn("p9par3", c3);
  const pPending = await parentIn("p9par4", c1, true);
  const parentIds = [p1.id, p2.id, p3.id];

  // Staff of A told by "staff" announcements: every active school account that is not a parent,
  // with its own password set.
  const { data: staffRows } = await admin.from("profiles").select("id, deactivated_at, must_change_password, roles!inner(key)")
    .eq("school_id", A.id);
  const staffIds = staffRows.filter((p) => !["parent", "student"].includes(p.roles.key) && !p.deactivated_at && !p.must_change_password).map((p) => p.id);
  const inactiveStaff = staffRows.filter((p) => !["parent", "student"].includes(p.roles.key) && (p.deactivated_at || p.must_change_password)).map((p) => p.id);
  // Whole school = every parent account of A (earlier suites leave their own too).
  const allParentIds = staffRows.filter((p) => p.roles.key === "parent" && !p.deactivated_at && !p.must_change_password).map((p) => p.id);

  const created = [];
  const posted = async (name, query) => {
    const { data, error } = await query;
    check(label(name), !error && Boolean(data), error ? `${error.code} ${error.message}` : "posted");
    if (data) created.push(data);
    return data;
  };

  // --- 1. Whole school, everyone ------------------------------------------------------------------
  const everyone = await posted("director posts to the whole school (everyone)", post(dirA, "school", "everyone"));
  const tEveryone = (await told(everyone)).map((n) => n.recipient_id);
  check(label("…every parent and every active staff member is told, not the author"),
    sameSet(tEveryone, [...allParentIds, ...staffIds.filter((x) => x !== fx.users.dirA.id)])
      && parentIds.every((x) => tEveryone.includes(x)), `${tEveryone.length} told`);
  check(label("…a parent who has not set their own password is not told"), !tEveryone.includes(pPending.id));
  if (inactiveStaff.length) check(label("…deactivated / password-pending staff are not told"), !inactiveStaff.some((x) => tEveryone.includes(x)));
  else skip(label("…deactivated staff are not told"), "no inactive staff in school A at this point");
  check(label("…the notification carries the id and the title"),
    (await told(everyone)).every((n) => n.data.title === "P9 school everyone"));
  await rows(label("…a parent reads it"), p3.client.from("announcements").select("id").eq("id", everyone), 1);
  await rows(label("…a teacher reads it"), tchA.from("announcements").select("id").eq("id", everyone), 1);

  // --- 2. Classes / levels, parents ---------------------------------------------------------------
  const toC1 = await posted("director posts to class 1A's parents", post(dirA, "classes", "parents", { classes: [c1] }));
  check(label("…only class 1A's parent is told"), sameSet((await told(toC1)).map((n) => n.recipient_id), [p1.id]));
  await rows(label("…class 1A's parent reads it"), p1.client.from("announcements").select("id").eq("id", toC1), 1);
  await rows(label("…and its target"), p1.client.from("announcement_targets").select("class_id").eq("announcement_id", toC1), 1);
  await rows(label("…class 1B's parent does not"), p2.client.from("announcements").select("id").eq("id", toC1), 0);
  await rows(label("…nor its target"), p2.client.from("announcement_targets").select("id").eq("announcement_id", toC1), 0);
  await rows(label("…a teacher (staff, not addressed) does not"), tchA.from("announcements").select("id").eq("id", toC1), 0);
  await rows(label("…the surveillant (announcements.manage) does"), survA.from("announcements").select("id").eq("id", toC1), 1);

  const toL1 = await posted("director posts to level 1's parents", post(dirA, "levels", "parents", { levels: [L1] }));
  check(label("…the parents of both level-1 classes are told, not level 2's"),
    sameSet((await told(toL1)).map((n) => n.recipient_id), [p1.id, p2.id]));
  await rows(label("…level 2's parent cannot read it"), p3.client.from("announcements").select("id").eq("id", toL1), 0);

  // --- 3. Staff only (surveillant) ------------------------------------------------------------------
  const toStaff = await posted("surveillant posts to the staff", post(survA, "school", "staff"));
  check(label("…only staff are told (no parent)"),
    sameSet((await told(toStaff)).map((n) => n.recipient_id), staffIds.filter((x) => x !== fx.users.survA.id)));
  await rows(label("…a parent cannot read it"), p1.client.from("announcements").select("id").eq("id", toStaff), 0);
  await rows(label("…a staff member without the permission reads it"), audA.from("announcements").select("id").eq("id", toStaff), 1);

  // --- 4. Teachers ----------------------------------------------------------------------------------
  const byTeacher = await posted("teacher posts to the parents of a class they teach", post(tchA, "classes", "parents", { classes: [c1], title: "P9 by teacher" }));
  check(label("…its parent is told"), sameSet((await told(byTeacher)).map((n) => n.recipient_id), [p1.id]));
  await refused("teacher cannot post to a class they do not teach", post(tchA, "classes", "parents", { classes: [c3] }), "42501");
  await refused("teacher cannot post to a class taught + one not taught", post(tchA, "classes", "parents", { classes: [c1, c3] }), "42501");
  await refused("teacher cannot post to a level", post(tchA, "levels", "parents", { levels: [L1] }), "42501");
  await refused("teacher cannot post to the whole school", post(tchA, "school", "parents"), "42501");
  await refused("another teacher cannot post to class 1A", post(tch2.client, "classes", "parents", { classes: [c1] }), "42501");

  // --- 5. Others cannot post ------------------------------------------------------------------------
  await refused("staff without announcements.manage cannot post", post(audA, "school", "everyone"), "42501");
  await refused("a parent cannot post", post(p1.client, "classes", "parents", { classes: [c1] }), "42501");
  await refused("anon cannot post", post(anon, "school", "everyone"), "42501");
  const anonRead = await anon.from("announcements").select("id").in("id", created);
  check(label("anon reads nothing (no grant)"), Boolean(anonRead.error) || anonRead.data.length === 0, anonRead.error?.code ?? `${anonRead.data.length} row(s)`);

  // --- 6. Shape rules --------------------------------------------------------------------------------
  await refused("staff audience only for the whole school", post(dirA, "classes", "staff", { classes: [c1] }), "23514");
  await refused("classes without a class", post(dirA, "classes", "parents"), "announcement_targets_invalid");
  await refused("levels with a class instead", post(dirA, "levels", "parents", { classes: [c1] }), "announcement_targets_invalid");
  // A whole-school announcement has no year: a target is refused by its not-null year first.
  await refused("whole school with targets", post(dirA, "school", "parents", { levels: [L1] }), "23502");
  await refused("title over 150 characters", post(dirA, "school", "parents", { title: "x".repeat(151) }), "23514");
  await refused("empty text", post(dirA, "school", "parents", { body: "   " }), "23514");
  await refused("a target cannot be added afterwards",
    dirA.from("announcement_targets").insert({ announcement_id: toC1, school_id: A.id, class_id: c3 }), "announcement_targets_locked");
  await refused("the author cannot be chosen",
    dirA.from("announcements").insert({ school_id: A.id, scope: "school", audience: "parents", title: "x", body: "y", created_by: fx.users.survA.id }), "42501");
  const { data: authorRow } = await admin.from("announcements").select("created_by, academic_year_id").eq("id", toC1).single();
  check(label("author and year are set by the database"), authorRow.created_by === fx.users.dirA.id && authorRow.academic_year_id === year);

  // --- 7. Edit ----------------------------------------------------------------------------------------
  await rows(label("teacher edits their own title"), tchA.from("announcements").update({ title: "P9 by teacher (modifié)" }).eq("id", byTeacher).select("id"), 1);
  check(label("…the parent's notification shows the new title"), (await told(byTeacher)).every((n) => n.data.title === "P9 by teacher (modifié)"));
  const { data: edited } = await admin.from("announcements").select("updated_by, updated_at").eq("id", byTeacher).single();
  check(label("…updated by / at recorded"), edited.updated_by === tch && Boolean(edited.updated_at));
  await denied(label("teacher cannot edit the director's announcement"), tchA.from("announcements").update({ title: "hack" }).eq("id", everyone).select("id"));
  await denied(label("a parent cannot edit an announcement they read"), p1.client.from("announcements").update({ title: "hack" }).eq("id", toC1).select("id"));
  await rows(label("the surveillant (manage) edits the teacher's text"), survA.from("announcements").update({ body: "Corrigé." }).eq("id", byTeacher).select("id"), 1);
  await refused("who it goes to cannot be changed", dirA.from("announcements").update({ audience: "everyone" }).eq("id", toC1), "42501");

  // --- 8. Delete --------------------------------------------------------------------------------------
  await denied(label("teacher cannot delete the director's announcement"), tchA.from("announcements").delete().eq("id", everyone).select("id"));
  await denied(label("a parent cannot delete one"), p1.client.from("announcements").delete().eq("id", toC1).select("id"));
  await rows(label("the surveillant (manage) deletes the teacher's announcement"), survA.from("announcements").delete().eq("id", byTeacher).select("id"), 1);
  check(label("…its notifications are gone"), (await told(byTeacher)).length === 0);
  const own = await posted("teacher posts again", post(tchA, "classes", "parents", { classes: [c1] }));
  await rows(label("teacher deletes their own"), tchA.from("announcements").delete().eq("id", own).select("id"), 1);

  // --- 9. School B -------------------------------------------------------------------------------------
  const parB = await account("p9parb", B, "parent");
  for (const [who, client] of [["B's director", dirB], ["B's parent", parB.client]]) {
    await rows(label(`${who} reads none of A's announcements`), client.from("announcements").select("id").in("id", created), 0);
    await rows(label(`${who} reads none of A's targets`), client.from("announcement_targets").select("id").eq("school_id", A.id), 0);
    await denied(label(`${who} cannot edit A's announcement`), client.from("announcements").update({ title: "hack" }).eq("id", everyone).select("id"));
    await denied(label(`${who} cannot delete A's announcement`), client.from("announcements").delete().eq("id", everyone).select("id"));
  }
  await rows(label("nobody of B was told anything of A"),
    admin.from("notifications").select("id").in("recipient_id", [fx.users.dirB.id, parB.id]).eq("type", "announcement"), 0);
  // B's class targets are checked in B's current year: without one, refused before the key check.
  const { data: bYear } = await admin.from("academic_years").select("id").eq("school_id", B.id).eq("is_current", true).maybeSingle();
  if (bYear) {
    await refused("B's director cannot target A's class", post(dirB, "classes", "parents", { classes: [c1] }), "23503");
    skip(label("no current year → only whole-school announcements"), "school B has a current year");
  } else {
    await refused("no current year: B's director cannot post to classes (not even A's)",
      post(dirB, "classes", "parents", { classes: [c1] }), "announcement_no_current_year");
    await posted("no current year: B's director still posts to the whole school", post(dirB, "school", "parents"));
  }
  await refused("B's director cannot post into A's school", dirB.from("announcements").insert({ school_id: A.id, scope: "school", audience: "parents", title: "x", body: "y" }), "42501");

  // --- 10. Messaging module off ---------------------------------------------------------------------------
  must(await admin.from("school_modules").upsert({ school_id: A.id, module_key: "messaging", enabled: false }, { onConflict: "school_id,module_key" }), "messaging off");
  await rows(label("module off: the director reads nothing"), dirA.from("announcements").select("id").in("id", created), 0);
  await rows(label("module off: a parent reads nothing"), p3.client.from("announcements").select("id").in("id", created), 0);
  await refused("module off: the director cannot post", post(dirA, "school", "everyone"), "42501");
  await admin.from("school_modules").delete().eq("school_id", A.id).eq("module_key", "messaging");
  await rows(label("module back on: the parent reads again"), p3.client.from("announcements").select("id").eq("id", everyone), 1);

  // --- Clean up ------------------------------------------------------------------------------------------
  await admin.from("announcements").delete().in("school_id", [A.id, B.id]);
  await admin.from("notifications").delete().in("school_id", [A.id, B.id]).eq("type", "announcement");
  await admin.from("student_guardians").delete().in("student_id", students);
  await admin.from("guardians").delete().in("id", guardians);
  await admin.from("students").delete().in("id", students);
  await admin.from("lessons").delete().eq("id", lesson);
  await admin.from("teacher_subjects").delete().eq("subject_id", subject);
  await admin.from("classes").delete().in("id", [c1, c2, c3]);
  await admin.from("time_slots").delete().eq("id", slot);
  if (!monday) await admin.from("school_days").delete().eq("academic_year_id", year).eq("day_of_week", 1);
  await admin.from("levels").delete().in("id", [L1, L2]);
  await admin.from("subjects").delete().eq("id", subject);
  if (before && before.id !== year) await admin.from("academic_years").update({ is_current: true }).eq("id", before.id);
  else if (!before) await admin.from("academic_years").update({ is_current: false }).eq("id", year);
  if (ownYear) await admin.from("academic_years").delete().eq("id", year);
  await admin.from("profiles").update({ must_change_password: tchState.must_change_password, deactivated_at: tchState.deactivated_at }).eq("id", tch);
}
