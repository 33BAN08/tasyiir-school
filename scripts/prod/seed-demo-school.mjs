// The demo school "École Démo Tasyir" (launch prep step 2c). Run it in your own terminal:
//   node --env-file=.env.local      scripts/prod/seed-demo-school.mjs --dev        [--dry-run] [--refresh | --remove]
//   node --env-file=.env.prod.local scripts/prod/seed-demo-school.mjs --production [--dry-run] [--refresh | --remove]
// Default: creates the school (flag OFF), its "pro" subscription and its 8 accounts, sets the
// contact card, turns the demo flag ON, then fills it (public.run_demo_reset). --refresh: on the
// existing demo school, flag OFF → shared password + names back, missing accounts created, contact
// card → flag ON (always, finally) → refill. --remove: flag OFF → school deleted → its 8 accounts.
// --dry-run: reads only. The shared password is DEMO_PASSWORD from the env file: it is never asked,
// never printed (not even in errors: only error codes are shown). The 5 extra teachers get random
// passwords nobody knows. The contact card is NEXT_PUBLIC_WHATSAPP_NUMBER (Call + WhatsApp).
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";

import { createClient } from "@supabase/supabase-js";

const DEV_REF = "ndnfeioxagdjjulmjonz";
const PRODUCTION_REF = "blycnuuomfqgvfczkbxc";
const SLUG = "ecole-demo-tasyir";
const DOMAIN = "demo.tasyir.ma";
const PLAN = "pro";
// shared = signs in with DEMO_PASSWORD; private.demo_fill finds teachers by the END of the local part.
const ACCOUNTS = [
  { local: "directeur", role: "director", fullName: "Nadia El Amrani", locale: "fr", shared: true },
  { local: "prof", role: "teacher", fullName: "Youssef Tazi", locale: "fr", shared: true },
  { local: "parent", role: "parent", fullName: "Karim Benali", locale: "ar", shared: true },
  { local: "enseignant.arabe", role: "teacher", fullName: "Abdelhak Alami", locale: "fr", shared: false },
  { local: "enseignant.francais", role: "teacher", fullName: "Sophia Berrada", locale: "fr", shared: false },
  { local: "enseignant.sciences", role: "teacher", fullName: "Hicham Chraibi", locale: "fr", shared: false },
  { local: "enseignant.histoire", role: "teacher", fullName: "Leila Mansouri", locale: "fr", shared: false },
  { local: "enseignant.anglais", role: "teacher", fullName: "Omar Lahlou", locale: "fr", shared: false },
].map((a) => ({ ...a, email: `${a.local}@${DOMAIN}` }));

function stop(message) {
  console.error(`\nSTOPPED: ${message}`);
  process.exit(1);
}
/** Only a code, never a message (a message could one day quote what was sent). */
const code = (error) => error?.code ?? error?.status ?? "unknown";

// --- Refusals that need nothing from the network --------------------------------------
const args = process.argv.slice(2);
const known = ["--dev", "--production", "--dry-run", "--refresh", "--remove"];
const unknown = args.filter((a) => !known.includes(a));
if (unknown.length) stop(`unknown option ${unknown[0]}`);
const dev = args.includes("--dev");
const production = args.includes("--production");
if (dev === production) stop("choose exactly one target: --dev or --production");
if (args.includes("--refresh") && args.includes("--remove")) stop("choose at most one of --refresh and --remove");
const mode = args.includes("--refresh") ? "refresh" : args.includes("--remove") ? "remove" : "create";
const dryRun = args.includes("--dry-run");

const expectedRef = dev ? DEV_REF : PRODUCTION_REF;
const url = dev ? process.env.NEXT_PUBLIC_SUPABASE_URL : process.env.PROD_SUPABASE_URL;
const secret = dev ? process.env.SUPABASE_SECRET_KEY : process.env.PROD_SUPABASE_SECRET_KEY;
if (dev && Object.keys(process.env).some((k) => k.startsWith("PROD_"))) {
  stop("--dev with production settings (PROD_*) loaded: use .env.local for DEV");
}
let host = null;
try {
  host = url ? new URL(url).hostname : null;
} catch {
  host = null;
}
if (host !== `${expectedRef}.supabase.co`) {
  stop(dev ? "NEXT_PUBLIC_SUPABASE_URL is not the DEV project (.env.local)" : "PROD_SUPABASE_URL is not the production project (.env.prod.local)");
}
if (!secret?.startsWith("sb_secret_")) stop("the secret key is missing or is not a secret key (sb_secret_…)");

// Same rules as the app's changePasswordSchema. The messages name the rule, never the value.
let password = process.env.DEMO_PASSWORD ?? "";
if (mode !== "remove") {
  if (!password) stop("DEMO_PASSWORD is not set in the env file");
  if (password.length < 8) stop("DEMO_PASSWORD needs at least 8 characters");
  if (new TextEncoder().encode(password).length > 72) stop("DEMO_PASSWORD is longer than 72 bytes");
  if (!/\p{L}/u.test(password) || !/\p{N}/u.test(password)) stop("DEMO_PASSWORD needs at least one letter and one digit");
}

/** NEXT_PUBLIC_WHATSAPP_NUMBER (digits, "2126…", "06…") → "+2126XXXXXXXX", or null. */
function moroccanMobile(raw) {
  const digits = (raw ?? "").replace(/\D/g, "");
  const national = digits.startsWith("212") ? digits.slice(3) : digits.startsWith("0") ? digits.slice(1) : digits;
  const e164 = `+212${national}`;
  return /^\+212[67][0-9]{8}$/.test(e164) ? e164 : null;
}
const contact = moroccanMobile(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER);

const needsKeyboard = production || mode === "remove";
if (!dryRun && needsKeyboard && (!process.stdin.isTTY || !process.stdout.isTTY)) {
  stop("run this in your own terminal: it asks you to confirm");
}

// --- Reads ---------------------------------------------------------------------------------
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const target = dev ? `DEV (${DEV_REF})` : `PRODUCTION (${PRODUCTION_REF})`;
console.log(`Demo school on ${target} — ${mode}${dryRun ? ", dry run: nothing is written" : ""}\n`);

const { data: school, error: schoolError } = await admin.from("schools").select("id, is_demo").eq("slug", SLUG).maybeSingle();
if (schoolError) stop(`could not read the schools (${code(schoolError)})`);

const users = new Map(); // email → auth user id
for (let page = 1; ; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) stop(`could not list accounts (${code(error)})`);
  for (const u of data.users) if (u.email) users.set(u.email.toLowerCase(), u.id);
  if (data.users.length < 1000) break;
}
const existing = ACCOUNTS.filter((a) => users.has(a.email));

const created = { schoolId: null };
const rl = createInterface({ input: process.stdin, output: process.stdout });
async function confirm(question, expected) {
  const answer = (await rl.question(question)).trim();
  if (answer !== expected) stop("not confirmed: nothing changed");
}
const setFlag = (on) => admin.from("schools").update({ is_demo: on }).eq("id", school?.id ?? created.schoolId);
const audit = (action, schoolId) =>
  admin.from("audit_logs").insert({
    school_id: null, // the nightly reset empties the demo school's own audit log
    actor_id: null,
    action,
    entity: "school",
    entity_id: schoolId,
    data: { slug: SLUG, via: "scripts/prod/seed-demo-school.mjs", target: dev ? "dev" : "production" },
  });
const randomPassword = () => `${randomBytes(32).toString("base64url")}a1`;

/** Creates one account + its profile in the school; the account is removed again if the profile fails. */
async function createAccount(account, schoolId, roleIds) {
  const { data, error } = await admin.auth.admin.createUser({
    email: account.email,
    password: account.shared ? password : randomPassword(),
    email_confirm: true,
  });
  if (error) throw new Error(`account ${account.email}: not created (${code(error)})`);
  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    school_id: schoolId,
    role_id: roleIds[account.role],
    full_name: account.fullName,
    email: account.email,
    locale: account.locale,
    must_change_password: false,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(`profile ${account.email}: refused (${code(profileError)})`);
  }
  users.set(account.email, data.user.id);
}

async function roleIdsOf(schoolId) {
  const { data, error } = await admin.from("roles").select("id, key").eq("school_id", schoolId);
  if (error) throw new Error(`roles: not read (${code(error)})`);
  return Object.fromEntries(data.map((r) => [r.key, r.id]));
}

async function saveContact(schoolId) {
  const { data: row } = await admin.from("schools").select("settings").eq("id", schoolId).single();
  const settings = { ...(row?.settings ?? {}), demo_contact: contact ? { phone: contact, whatsapp: contact } : {} };
  const { error } = await admin.from("schools").update({ settings }).eq("id", schoolId);
  if (error) throw new Error(`settings: not saved (${code(error)})`);
}

async function fill(schoolId) {
  const { data, error } = await admin.rpc("run_demo_reset", { p_school: schoolId });
  if (error) throw new Error(`fill: refused (${error.hint ?? code(error)})`);
  if (data !== null) throw new Error("fill: a demo account was still impersonated after the reset");
}

async function summary(schoolId) {
  const count = async (table, extra = (q) => q) =>
    (await extra(admin.from(table).select("*", { count: "exact", head: true }).eq("school_id", schoolId))).count;
  console.log(
    `Demo school ${schoolId}: ${await count("profiles")} accounts, ${await count("classes")} classes, ` +
      `${await count("students")} students, ${await count("lessons")} lessons, ${await count("attendance_sessions")} roll calls.`,
  );
  console.log(contact ? "Contact card: Call + WhatsApp on NEXT_PUBLIC_WHATSAPP_NUMBER." : "Contact card: empty (no Moroccan mobile in NEXT_PUBLIC_WHATSAPP_NUMBER).");
}

// --- create ----------------------------------------------------------------------------------
if (mode === "create") {
  if (school) stop(`the school ${SLUG} already exists: use --refresh (or --remove first)`);
  if (existing.length) stop(`these accounts already exist: ${existing.map((a) => a.email).join(", ")}`);
  const { data: plan, error: planError } = await admin.from("plans").select("id").eq("key", PLAN).maybeSingle();
  if (planError || !plan) stop(`plan "${PLAN}" not found (${planError ? code(planError) : "no row"})`);
  if (!contact) console.log("Warning: NEXT_PUBLIC_WHATSAPP_NUMBER is not a Moroccan mobile: the contact card stays empty.");
  if (dryRun) {
    console.log(`Dry run OK: no school ${SLUG}, the 8 e-mails are free, plan "${PLAN}" is there. Nothing was written.`);
    process.exit(0);
  }
  if (production) await confirm(`Create "École Démo Tasyir" and its 8 accounts on PRODUCTION? Type yes: `, "yes");
  rl.close();

  try {
    const { data: row, error } = await admin
      .from("schools")
      .insert({ name: "École Démo Tasyir", slug: SLUG, city: "Casablanca" })
      .select("id")
      .single();
    if (error) throw new Error(`school: not created (${code(error)})`);
    created.schoolId = row.id;
    const { error: subError } = await admin
      .from("school_subscriptions")
      .insert({ school_id: row.id, plan_id: plan.id, status: "active" });
    if (subError) throw new Error(`subscription: not created (${code(subError)})`);
    const roleIds = await roleIdsOf(row.id);
    for (const account of ACCOUNTS) await createAccount(account, row.id, roleIds);
    await saveContact(row.id);
    const { error: flagError } = await setFlag(true);
    if (flagError) throw new Error(`demo flag: not set (${code(flagError)})`);
    await fill(row.id);
  } catch (error) {
    // Nothing half-made: flag off, school (and its data) deleted, then its accounts.
    if (created.schoolId) {
      await setFlag(false);
      await admin.from("schools").delete().eq("id", created.schoolId);
    }
    for (const account of ACCOUNTS) if (users.has(account.email)) await admin.auth.admin.deleteUser(users.get(account.email));
    stop(`${error.message}. Everything created was removed again.`);
  }
  password = null;
  await audit("demo_school.create", created.schoolId);
  await summary(created.schoolId);
  console.log("Sign in as directeur@ / prof@ / parent@demo.tasyir.ma with DEMO_PASSWORD.");
  process.exit(0);
}

// --- refresh / remove need the school ----------------------------------------------------------
if (!school) stop(`there is no school ${SLUG} yet: run without --refresh / --remove first`);

if (mode === "refresh") {
  const missing = ACCOUNTS.filter((a) => !users.has(a.email));
  if (!contact) console.log("Warning: NEXT_PUBLIC_WHATSAPP_NUMBER is not a Moroccan mobile: the contact card will be empty.");
  if (dryRun) {
    console.log(`Dry run OK: school ${school.id} (demo flag ${school.is_demo ? "on" : "OFF"}), ` +
      `${ACCOUNTS.length - missing.length} of 8 accounts there${missing.length ? `, missing: ${missing.map((a) => a.email).join(", ")}` : ""}. Nothing was written.`);
    process.exit(0);
  }
  if (production) await confirm("Refresh the demo school on PRODUCTION (password, accounts, contact card, refill)? Type yes: ", "yes");
  rl.close();

  const { error: offError } = await setFlag(false);
  if (offError) stop(`demo flag: not turned off (${code(offError)}); nothing changed`);
  let failure = null;
  try {
    const roleIds = await roleIdsOf(school.id);
    for (const account of ACCOUNTS) {
      const id = users.get(account.email);
      if (!id) {
        await createAccount(account, school.id, roleIds);
        continue;
      }
      const { data: profile } = await admin.from("profiles").select("school_id").eq("id", id).maybeSingle();
      if (profile?.school_id !== school.id) throw new Error(`${account.email} belongs to another school: left alone`);
      if (account.shared) {
        const { error } = await admin.auth.admin.updateUserById(id, { password });
        if (error) throw new Error(`password of ${account.email}: not changed (${code(error)})`);
      }
      const { error } = await admin
        .from("profiles")
        .update({ full_name: account.fullName, locale: account.locale, role_id: roleIds[account.role], must_change_password: false, deactivated_at: null })
        .eq("id", id);
      if (error) throw new Error(`profile of ${account.email}: not restored (${code(error)})`);
    }
    await saveContact(school.id);
  } catch (error) {
    failure = error;
  } finally {
    const { error } = await setFlag(true);
    if (error) stop(`THE DEMO FLAG IS OFF (${code(error)}): turn it on by hand (schools.is_demo, slug ${SLUG})`);
  }
  password = null;
  if (failure) stop(`${failure.message}. The demo flag is back on; run --refresh again.`);
  try {
    await fill(school.id);
  } catch (error) {
    stop(error.message);
  }
  await audit("demo_school.refresh", school.id);
  await summary(school.id);
  process.exit(0);
}

// --- remove ------------------------------------------------------------------------------------
// Only accounts whose profile is in the demo school (read BEFORE the school and its profiles go).
const { data: members, error: membersError } = await admin
  .from("profiles")
  .select("id")
  .eq("school_id", school.id)
  .in("email", ACCOUNTS.map((a) => a.email));
if (membersError) stop(`could not read the demo accounts (${code(membersError)})`);
const ours = existing.filter((a) => members.some((m) => m.id === users.get(a.email)));
if (dryRun) {
  console.log(`Dry run OK: would delete school ${school.id} and ${ours.length} account(s). Nothing was written.`);
  process.exit(0);
}
await confirm(`Delete the demo school and its accounts on ${target}? Type the slug (${SLUG}): `, SLUG);
rl.close();
const { error: offError } = await setFlag(false);
if (offError) stop(`demo flag: not turned off (${code(offError)}); nothing deleted`);
const { error: deleteError } = await admin.from("schools").delete().eq("id", school.id);
if (deleteError) stop(`school: not deleted (${code(deleteError)}); its demo flag is OFF — run --refresh to turn it back on`);
const left = [];
for (const account of ours) {
  const { error } = await admin.auth.admin.deleteUser(users.get(account.email));
  if (error) left.push(account.email);
}
await audit("demo_school.remove", school.id);
console.log(`Deleted school ${school.id} and ${ours.length - left.length} account(s).${left.length ? ` Not deleted: ${left.join(", ")}` : ""}`);
process.exit(0);
