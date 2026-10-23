// Launch prep step 2c — demo school locks + reset (migration launch_demo_school).
// Everything here talks to Supabase DIRECTLY (publishable key + the demo account's
// own session, or the secret key for "any server path"), never through the app:
// the locks must hold even for someone who skips our screens and actions.
import { randomBytes } from "node:crypto";

import { check, denied, rows, skip } from "./checks.mjs";
import { admin, anon, signIn } from "./fixtures.mjs";
import { ensureDemoSchool } from "./demo-fixture.mjs";

const label = (s) => `[Demo] ${s}`;

/** The Auth fields a token-producing flow writes (recovery / magic link / email change). */
async function authState(id) {
  const { data, error } = await admin.auth.admin.getUserById(id);
  if (error) throw new Error(`getUserById failed (${error.code})`);
  const u = data.user;
  return {
    email: u.email,
    newEmail: u.new_email ?? null,
    recoverySentAt: u.recovery_sent_at ?? null,
    confirmationSentAt: u.confirmation_sent_at ?? null,
    emailChangeSentAt: u.email_change_sent_at ?? null,
    bannedUntil: u.banned_until ?? null,
  };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Tables the reset keeps for a demo school (not deleted; demo_fill may update them). */
const KEPT = ["schools", "profiles", "roles", "role_permissions", "school_modules", "school_subscriptions", "alert_rules", "school_contacts"];
/** Tables private.demo_fill writes (always rows). Any other table with a school_id must be empty after a reset. */
const FILLED = [
  "academic_years", "school_days", "time_slots", "levels", "rooms", "classes", "subjects", "teacher_subjects", "lessons",
  "students", "student_enrollments", "guardians", "student_guardians", "student_remarks", "announcements",
  "announcement_targets", "notifications",
];
/** Filled from the roll calls of the last weeks: none in the first days of a school year. */
const FILLED_FROM_HISTORY = ["attendance_sessions", "attendance_marks", "absence_notices", "justifications"];

/** Every public table with a school_id column, from the Data API's OpenAPI description (secret key). */
async function tablesWithSchoolId() {
  const res = await fetch(new URL("/rest/v1/", process.env.NEXT_PUBLIC_SUPABASE_URL), {
    headers: { apikey: process.env.SUPABASE_SECRET_KEY, Accept: "application/openapi+json" },
  });
  if (!res.ok) throw new Error(`OpenAPI description: HTTP ${res.status}`);
  const spec = await res.json();
  return Object.entries(spec.definitions ?? {})
    .filter(([, def]) => def.properties && "school_id" in def.properties)
    .map(([name]) => name);
}

export async function phaseLaunchDemo({ fx, as }) {
  const demo = await ensureDemoSchool(fx);
  const { demoDir, demoProf, demoParent } = demo.users;
  const dir = await signIn(demoDir);
  const parent = await signIn(demoParent);
  const B = fx.schools.b;

  // --- The flag: only the secret key sets or clears it -----------------------------------------------
  await denied(label("platform owner cannot clear the demo flag"),
    as.owner.from("schools").update({ is_demo: false }).eq("id", demo.id).select("id"));
  await denied(label("platform owner cannot make school B a demo school"),
    as.owner.from("schools").update({ is_demo: true }).eq("id", B.id).select("id"));
  await denied(label("platform owner cannot create a school already flagged demo"),
    as.owner.from("schools").insert({ name: `RLS demo insert ${fx.run}`, slug: `rls-test-x-${fx.run}`, is_demo: true }).select("id"));
  await denied(label("the demo director cannot clear the flag of their own school"),
    dir.from("schools").update({ is_demo: false }).eq("id", demo.id).select("id"));
  await rows(label("the demo school is still flagged"), admin.from("schools").select("id").eq("id", demo.id).eq("is_demo", true), 1);

  // --- Password change via auth.updateUser (publishable key + demo session) --------------------------
  const before = await authState(demoDir.id);
  const newPassword = `${randomBytes(12).toString("base64url")}a1`;
  const pw = await dir.auth.updateUser({ password: newPassword });
  check(label("updateUser({ password }) with the demo session is refused"), Boolean(pw.error), pw.error ? `refused (${pw.error.status ?? ""} ${pw.error.code ?? ""})` : "PASSWORD CHANGED!");
  const oldStill = await anon().auth.signInWithPassword({ email: demoDir.email, password: demoDir.password });
  check(label("... the demo password still signs in"), !oldStill.error, oldStill.error?.code ?? "");
  const newWorks = await anon().auth.signInWithPassword({ email: demoDir.email, password: newPassword });
  check(label("... the new password does not"), Boolean(newWorks.error), newWorks.error ? "refused" : "NEW PASSWORD WORKS!");

  // --- Email change via auth.updateUser ---------------------------------------------------------------
  // Auth refuses a domain without a mail server (example.com, demo.tasyir.ma: 400
  // email_address_invalid) before the database is reached, so the new address must be on a real
  // mail domain: a random, unused Gmail address. Nothing is delivered from DEV even if the lock
  // failed (the default Supabase mailer only sends to the team's own addresses).
  const em = await dir.auth.updateUser({ email: `tasyir-rls-${fx.run}-${randomBytes(4).toString("hex")}@gmail.com` });
  // Auth's email rate limit (429) answers before the database: then the lock was not reached, so the
  // check is skipped (the secret-key email change below always reaches it).
  if (em.error?.code === "over_email_send_rate_limit") {
    skip(label("updateUser({ email }) with the demo session is refused by the lock"), "Auth email rate limit (429) answered first");
  } else {
    check(label("updateUser({ email }) with the demo session is refused by the lock"),
      Boolean(em.error) && em.error.code !== "email_address_invalid",
      em.error ? `refused (${em.error.status ?? ""} ${em.error.code ?? ""})` : "EMAIL CHANGE ACCEPTED!");
  }
  const adminEmail = await admin.auth.admin.updateUserById(demoDir.id, { email: `rls-test+${fx.run}-hijack2@demo.tasyir.ma` });
  check(label("secret key cannot change a demo account's email"), Boolean(adminEmail.error), adminEmail.error ? `refused (${adminEmail.error.status ?? ""})` : "EMAIL CHANGED!");
  const afterEmail = await authState(demoDir.id);
  check(label("... email unchanged, no pending new email, no email-change sent"),
    afterEmail.email === before.email && !afterEmail.newEmail && afterEmail.emailChangeSentAt === before.emailChangeSentAt,
    JSON.stringify({ newEmail: afterEmail.newEmail, sent: afterEmail.emailChangeSentAt !== before.emailChangeSentAt }));
  const ph = await dir.auth.updateUser({ phone: "+212600000000" });
  check(label("updateUser({ phone }) with the demo session is refused"), Boolean(ph.error), ph.error ? "refused" : "PHONE CHANGE ACCEPTED!");

  // --- Two-factor enrolment (publishable key + demo session) -------------------------------------------
  const mfa = await dir.auth.mfa.enroll({ factorType: "totp", friendlyName: `rls-demo-${fx.run}` });
  check(label("mfa.enroll(totp) with the demo session is refused"), Boolean(mfa.error), mfa.error ? `refused (${mfa.error.status ?? ""})` : "FACTOR ENROLLED!");
  const factors = await admin.auth.admin.mfa.listFactors({ userId: demoDir.id });
  check(label("... the demo director has no factor"), !factors.error && factors.data.factors.length === 0, factors.error?.code ?? `${factors.data?.factors.length} factor(s)`);
  // Control: an ordinary account can enrol (then the factor is removed again).
  const ctl = await as.dirB.auth.mfa.enroll({ factorType: "totp", friendlyName: `rls-ctl-${fx.run}` });
  check(label("control: mfa.enroll(totp) works for an ordinary account"), !ctl.error, ctl.error?.code ?? "");
  if (ctl.data?.id) await as.dirB.auth.mfa.unenroll({ factorId: ctl.data.id });

  // --- "Forgot password" and magic link (publishable key, no session) --------------------------------
  // Only the outcome counts: no token may be recorded. (A 429 from the email rate
  // limit also means no token; the generateLink checks below prove the lock itself.)
  const parentBefore = await authState(demoParent.id);
  const recover = await anon().auth.resetPasswordForEmail(demoParent.email);
  const otp = await anon().auth.signInWithOtp({ email: demoParent.email, options: { shouldCreateUser: false } });
  const parentAfter = await authState(demoParent.id);
  check(label("resetPasswordForEmail + signInWithOtp record no recovery / magic-link token"),
    parentAfter.recoverySentAt === parentBefore.recoverySentAt && parentAfter.confirmationSentAt === parentBefore.confirmationSentAt,
    `recover: ${recover.error ? `error ${recover.error.status ?? ""} ${recover.error.code ?? ""}` : "ok"}, otp: ${otp.error ? `error ${otp.error.status ?? ""} ${otp.error.code ?? ""}` : "ok"}`);

  // generateLink is how a token is minted without any email: it must fail for a demo account …
  for (const type of ["recovery", "magiclink"]) {
    const link = await admin.auth.admin.generateLink({ type, email: demoParent.email });
    check(label(`generateLink(${type}) for a demo account gives no token`),
      Boolean(link.error) && !link.data?.properties?.hashed_token,
      link.error ? "refused" : "TOKEN MINTED!");
  }
  // … and work for an ordinary account (control: the lock, not the API, refuses).
  const control = await admin.auth.admin.generateLink({ type: "magiclink", email: fx.users.dirB.email });
  check(label("control: generateLink(magiclink) works for an ordinary account"), !control.error && Boolean(control.data?.properties?.hashed_token), control.error?.code ?? "");

  // --- Secret-key paths (what any server action would do) ---------------------------------------------
  const profBefore = await authState(demoProf.id);
  const ban = await admin.auth.admin.updateUserById(demoProf.id, { ban_duration: "1h" });
  check(label("secret key cannot ban a demo account"), Boolean(ban.error), ban.error ? "refused" : "BANNED!");
  const reset = await admin.auth.admin.updateUserById(demoProf.id, { password: newPassword });
  check(label("secret key cannot reset a demo account's password"), Boolean(reset.error), reset.error ? "refused" : "PASSWORD RESET!");
  const del = await admin.auth.admin.deleteUser(demoParent.id);
  check(label("secret key cannot delete a demo account"), Boolean(del.error), del.error ? "refused" : "DELETED!");
  const profAfter = await authState(demoProf.id);
  check(label("... the teacher's Auth account is unchanged (no ban)"), same(profBefore, profAfter) && !profAfter.bannedUntil);
  await rows(label("... the parent's account still exists"), admin.from("profiles").select("id").eq("id", demoParent.id), 1);

  const extra = await admin.auth.admin.createUser({ email: `rls-test+${fx.run}-demoextra@example.com`, password: newPassword, email_confirm: true });
  if (extra.data?.user) fx.createdUserIds.push(extra.data.user.id);
  await denied(label("no new profile in the demo school, even with the secret key"),
    admin.from("profiles").insert({ id: extra.data?.user?.id, school_id: demo.id, role_id: demo.roles.surveillant, full_name: "RLS demo extra", must_change_password: true }).select("id"));
  await denied(label("secret key cannot deactivate a demo profile"),
    admin.from("profiles").update({ deactivated_at: new Date().toISOString() }).eq("id", demoProf.id).select("id"));
  await denied(label("secret key cannot change a demo profile's role"),
    admin.from("profiles").update({ role_id: demo.roles.director }).eq("id", demoProf.id).select("id"));
  await denied(label("secret key cannot set must_change_password on a demo profile"),
    admin.from("profiles").update({ must_change_password: true }).eq("id", demoParent.id).select("id"));

  // --- current_user = postgres passes the locks (migrations, postgres-owned functions) ----------------
  // The harness has no postgres connection: a school inserted ALREADY flagged gets its roles and their
  // permissions from schools_seed_roles, a postgres-owned DEFINER trigger — only the postgres bypass lets
  // those inserts through. The same inserts with the secret key (service_role) stay refused.
  const flagged = await admin.from("schools").insert({ name: `RLS test E (demo) ${fx.run}`, slug: `rls-test-e-${fx.run}`, is_demo: true }).select("id").single();
  if (flagged.data) fx.createdSchoolIds.push(flagged.data.id);
  const seeded = flagged.data
    ? (await admin.from("roles").select("id, role_permissions(permission_key)").eq("school_id", flagged.data.id)).data ?? []
    : [];
  check(label("postgres (seed trigger) creates roles + permissions in a flagged school"),
    !flagged.error && seeded.length > 0 && seeded.some((r) => r.role_permissions.length > 0),
    flagged.error?.message ?? `${seeded.length} role(s)`);
  await denied(label("... service_role still cannot add a role there"),
    admin.from("roles").insert({ school_id: flagged.data?.id, key: "extra_role", name: "Extra" }).select("id"));
  await denied(label("... nor remove a permission there"),
    admin.from("role_permissions").delete().eq("role_id", seeded[0]?.id ?? "00000000-0000-0000-0000-000000000000").select("role_id"));

  // --- The demo user on their own profile -------------------------------------------------------------
  await denied(label("demo director cannot rename themself"),
    dir.from("profiles").update({ full_name: "Visitor was here" }).eq("id", demoDir.id).select("id"));
  const lang = await parent.from("profiles").update({ locale: "fr" }).eq("id", demoParent.id).select("id");
  check(label("demo parent can still switch language (locale)"), !lang.error && lang.data?.length === 1, lang.error?.code ?? "");

  // --- Roles are read-only in the demo school ---------------------------------------------------------
  await denied(label("demo director cannot create a role"),
    dir.from("roles").insert({ school_id: demo.id, key: "visitor_role", name: "Visitor" }).select("id"));
  await denied(label("demo director cannot remove a permission from a role"),
    dir.from("role_permissions").delete().eq("role_id", demo.roles.surveillant).select("role_id"));
  await denied(label("demo director cannot add a permission to a role"),
    dir.from("role_permissions").insert({ role_id: demo.roles.teacher, permission_key: "users.manage" }).select("role_id"));

  // --- Data still works; uploads do not ---------------------------------------------------------------
  const student = await dir
    .from("students")
    .insert({ school_id: demo.id, last_name: "Demo", first_name: "Visiteur", birth_date: "2015-05-05", gender: "male" })
    .select("id")
    .single();
  check(label("demo director can still add a student (data stays usable)"), !student.error, student.error?.code ?? "");
  const file = new Blob([new Uint8Array([0x52, 0x49, 0x46, 0x46])], { type: "image/webp" });
  const up = await dir.storage.from("student-photos").upload(`${demo.id}/${student.data?.id}/${crypto.randomUUID()}.webp`, file, { contentType: "image/webp" });
  check(label("demo director cannot upload a student photo"), Boolean(up.error), up.error ? "refused" : "UPLOADED!");
  const upNote = await parent.storage.from("justifications").upload(`${demo.id}/${student.data?.id}/${crypto.randomUUID()}.pdf`, new Blob(["%PDF-1.4"], { type: "application/pdf" }), { contentType: "application/pdf" });
  check(label("demo parent cannot upload a justification note"), Boolean(upNote.error), upNote.error ? "refused" : "UPLOADED!");

  // --- No subscription reminder for a demo school ------------------------------------------------------
  // Its active subscription ends in 5 days: an ordinary school would get the 7-day step at once.
  const end = new Date(Date.now() + 5 * 86400e3).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const { data: sub } = await admin.from("school_subscriptions").select("id, end_date").eq("school_id", demo.id).eq("status", "active").single();
  await admin.from("school_subscriptions").update({ end_date: end }).eq("id", sub.id);
  const sent = await admin.rpc("run_subscription_reminders", { p_today: today, p_schools: [demo.id] });
  check(label("subscription ending in 5 days: no reminder for the demo school"), !sent.error && sent.data === 0, sent.error?.message ?? `${sent.data} sent`);
  await rows(label("... nothing recorded"), admin.from("subscription_reminders").select("subscription_id").eq("school_id", demo.id), 0);
  await rows(label("... no notification to its director or the platform owners"),
    admin.from("notifications").select("id").eq("type", "subscription_expiring").eq("data->>school_id", demo.id), 0);
  await admin.from("school_subscriptions").update({ end_date: sub.end_date }).eq("id", sub.id);

  // --- Reset ------------------------------------------------------------------------------------------
  const userRun = await dir.rpc("run_demo_reset", { p_school: demo.id });
  check(label("a demo session cannot run the reset"), Boolean(userRun.error), userRun.error?.code ?? "RAN!");
  const notDemo = await admin.rpc("run_demo_reset", { p_school: B.id });
  check(label("run_demo_reset refuses a school that is not a demo school"), Boolean(notDemo.error) && /not a demo school/.test(notDemo.error.message), notDemo.error?.message ?? "RAN ON B!");
  await rows(label("... school B kept its data (audit row)"), admin.from("audit_logs").select("id").eq("school_id", B.id), (r) => r.length > 0);

  await admin.from("audit_logs").insert({ school_id: demo.id, action: "rls.test", entity: "school" });
  const ran = await admin.rpc("run_demo_reset", { p_school: demo.id });
  check(label("run_demo_reset (secret key) resets the demo school"), !ran.error, ran.error?.message ?? "");
  check(label("... and auth.uid() is null once it returns (no demo impersonation left)"),
    !ran.error && ran.data === null, ran.error ? "" : `auth.uid() = ${ran.data}`);
  await rows(label("... the visitor's student is gone"),
    admin.from("students").select("id").eq("school_id", demo.id).eq("first_name", "Visiteur"), 0);
  await rows(label("... the demo audit log is emptied"), admin.from("audit_logs").select("id").eq("school_id", demo.id), 0);
  await rows(label("... the 8 demo accounts are kept"), admin.from("profiles").select("id").eq("school_id", demo.id).is("deactivated_at", null), 8);
  await rows(label("... the roles and the subscription are kept"),
    admin.from("school_subscriptions").select("id").eq("school_id", demo.id).eq("status", "active"), 1);

  // --- Demo content (private.demo_fill) ---------------------------------------------------------------
  // `today` (above) = the UTC date = Morocco's date (UTC+0 permanently since 2026-09-20).
  const { data: classes } = await admin.from("classes").select("name, lessons(id)").eq("school_id", demo.id).order("name");
  check(label("4 classes, each with its 29 weekly lessons"),
    classes?.length === 4 && classes.every((c) => c.lessons.length === 29), classes?.map((c) => `${c.name}:${c.lessons.length}`).join(" ") ?? "");
  await rows(label("96 students, all enrolled"), admin.from("student_enrollments").select("student_id").eq("school_id", demo.id), 96);
  await rows(label("the demo teacher has the 20 Maths lessons"), admin.from("lessons").select("id").eq("school_id", demo.id).eq("teacher_id", demoProf.id), 20);
  await rows(label("no roll call today or later (today's is the visitor's)"),
    admin.from("attendance_sessions").select("id").eq("school_id", demo.id).gte("session_date", today), 0);
  const { data: sessions } = await admin.from("attendance_sessions").select("session_date, taken_at").eq("school_id", demo.id);
  check(label("each roll call is dated on its own day (backdated)"),
    (sessions ?? []).every((x) => x.taken_at.slice(0, 10) === x.session_date), `${sessions?.length ?? 0} roll call(s)`);
  await rows(label("no announcement shows as edited"),
    admin.from("announcements").select("id").eq("school_id", demo.id).not("updated_at", "is", null), 0);
  await rows(label("contact card restored from settings.demo_contact"),
    admin.from("school_contacts").select("school_id").eq("school_id", demo.id).eq("phone", "+212522000000").eq("whatsapp", "+212600000000"), 1);
  await rows(label("the demo parent sees exactly their 2 children (RLS)"), parent.from("students").select("id"), 2);
  await rows(label("... their remarks"), parent.from("student_remarks").select("id"), 2);
  await rows(label("... and announcement notifications"), parent.from("notifications").select("id").eq("type", "announcement"), (r) => r.length >= 3);
  if (today.slice(5) >= "09-15" || today.slice(5) <= "06-30") {
    await rows(label("one justification approved, one pending (the demo children)"),
      admin.from("justifications").select("status").eq("school_id", demo.id),
      (r) => r.filter((j) => j.status === "approved").length === 1 && r.filter((j) => j.status === "pending").length === 1);
  } else {
    skip(label("one justification approved, one pending"), "fewer than 8 school days in this school year");
  }

  // Generic: every table with a school_id. Filled tables have rows; every other one (not kept) is
  // empty; a second reset the same day gives the same counts everywhere. A table added later and
  // forgotten in private.reset_demo_school fails here (it doubles, or keeps a visitor's rows).
  const tables = await tablesWithSchoolId();
  check(label("OpenAPI lists the school tables"), tables.length >= 32 && tables.includes("students"), `${tables.length} table(s)`);
  const countAll = async () => {
    const out = {};
    for (const table of tables) {
      const { count, error } = await admin.from(table).select("*", { count: "exact", head: true }).eq("school_id", demo.id);
      out[table] = error ? `error ${error.code}` : count;
    }
    return out;
  };
  const first = await countAll();
  const emptyMissing = FILLED.filter((t) => !(first[t] > 0));
  check(label("every table demo_fill writes has rows"), emptyMissing.length === 0, emptyMissing.join(", ") || `${FILLED.length} table(s)`);
  const unexpected = tables.filter((t) => ![...KEPT, ...FILLED, ...FILLED_FROM_HISTORY].includes(t) && first[t] !== 0);
  check(label("every other table with a school_id is empty after the reset"), unexpected.length === 0,
    unexpected.map((t) => `${t}: ${first[t]}`).join(", ") || "none");
  const again = await admin.rpc("run_demo_reset", { p_school: demo.id });
  const second = await countAll();
  const changed = tables.filter((t) => first[t] !== second[t]);
  check(label("a second reset the same day gives the same counts in every table"), !again.error && changed.length === 0,
    again.error?.message ?? (changed.map((t) => `${t}: ${first[t]} -> ${second[t]}`).join(", ") || `${tables.length} table(s)`));

  const signInAfter = await anon().auth.signInWithPassword({ email: demoDir.email, password: demoDir.password });
  check(label("... the demo director still signs in with the demo password"), !signInAfter.error, signInAfter.error?.code ?? "");
}
