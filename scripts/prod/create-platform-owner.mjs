// Creates THE platform owner account on PRODUCTION (launch prep step 1). Run it in your
// own terminal (never through Claude's `!`): it asks for the email, and for the password
// twice with nothing shown on screen.
//   node --env-file=.env.prod.local --experimental-strip-types scripts/prod/create-platform-owner.mjs --production --dry-run
//   node --env-file=.env.prod.local --experimental-strip-types scripts/prod/create-platform-owner.mjs --production
// Needs PROD_SUPABASE_URL + PROD_SUPABASE_SECRET_KEY in .env.prod.local (git-ignored).
// Same path as the app's createStaff: auth.admin.createUser, then the profile (removed
// again if it fails), then an audit row. Never prints the key or the password.
import { createInterface } from "node:readline/promises";

import { createClient } from "@supabase/supabase-js";

const PRODUCTION_REF = "blycnuuomfqgvfczkbxc";
const LOCALES = ["ar", "fr", "en"];

function stop(message) {
  console.error(`\nSTOPPED: ${message}`);
  process.exit(1);
}

// --- Refusals that need nothing from the network --------------------------------------
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
if (!args.includes("--production")) stop("add --production: this script only creates the PRODUCTION platform owner");
const unknown = args.filter((a) => a !== "--production" && a !== "--dry-run");
if (unknown.length) stop(`unknown option ${unknown[0]}`);

const url = process.env.PROD_SUPABASE_URL;
const secret = process.env.PROD_SUPABASE_SECRET_KEY;
let host = null;
try {
  host = url ? new URL(url).hostname : null;
} catch {
  host = null;
}
if (host !== `${PRODUCTION_REF}.supabase.co`) stop("PROD_SUPABASE_URL is not the production project (expected in .env.prod.local)");
if (!secret?.startsWith("sb_secret_")) stop("PROD_SUPABASE_SECRET_KEY is missing or is not a secret key (sb_secret_…)");
if (!process.stdin.isTTY || !process.stdout.isTTY) stop("run this in your own terminal: it reads your password from the keyboard");

// --- Input ---------------------------------------------------------------------------
// Same rules as the app's changePasswordSchema (src/lib/validations/auth.ts).
function passwordProblem(password) {
  if (password.length < 8) return "at least 8 characters";
  if (new TextEncoder().encode(password).length > 72) return "at most 72 bytes (bcrypt ignores the rest)";
  if (!/\p{L}/u.test(password) || !/\p{N}/u.test(password)) return "at least one letter and one digit";
  return null;
}

/** Reads a line without showing it (raw keyboard mode: no echo, no dots). */
function askHidden(prompt) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();
    let value = "";
    const finish = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write("\n");
    };
    function onData(chunk) {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          finish();
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          finish();
          stop("cancelled");
        }
        if (ch === "\u007f" || ch === "\b") value = [...value].slice(0, -1).join("");
        else if (ch >= " ") value += ch;
      }
    }
    stdin.on("data", onData);
  });
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
console.log(`Platform owner for PRODUCTION (${PRODUCTION_REF})${dryRun ? " — dry run, nothing is written" : ""}\n`);

const fullName = (await rl.question("Full name: ")).trim().replace(/\s+/g, " ");
if (!fullName || fullName.length > 100) stop("the full name must be 1 to 100 characters");

const email = (await rl.question("Email: ")).trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.endsWith(".invalid")) stop("that is not a usable email address");

const locale = (await rl.question("Language (ar / fr / en) [ar]: ")).trim().toLowerCase() || "ar";
if (!LOCALES.includes(locale)) stop("the language must be ar, fr or en");

// --- Checks against production (reads only) ----------------------------------------------
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: role, error: roleError } = await admin
  .from("roles")
  .select("id")
  .is("school_id", null)
  .eq("key", "platform_owner")
  .maybeSingle();
if (roleError || !role) stop(`the platform_owner role was not found (${roleError?.code ?? "no row"})`);

const { count: owners, error: ownersError } = await admin
  .from("profiles")
  .select("id", { count: "exact", head: true })
  .eq("role_id", role.id);
if (ownersError) stop(`could not count platform owners (${ownersError.code})`);
if (owners > 0) stop(`production already has ${owners} platform owner account(s): nothing created`);

const { data: page, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) stop(`could not list accounts (${listError.code ?? listError.status})`);
if (page.users.some((u) => u.email?.toLowerCase() === email)) stop("an account with that email already exists: nothing created");

if (dryRun) {
  rl.close();
  console.log(`\nDry run OK: production has no platform owner yet, ${page.users.length} account(s) in all,`);
  console.log("the email is free and the role is there. Nothing was written. Run again without --dry-run.");
  process.exit(0);
}

const answer = (await rl.question(`\nCreate the platform owner "${fullName}" <${email}> on PRODUCTION? Type yes: `)).trim();
rl.close();
if (answer !== "yes") stop("not confirmed: nothing created");

let password;
for (;;) {
  password = await askHidden("Password (nothing is shown as you type): ");
  const problem = passwordProblem(password);
  if (problem) {
    console.log(`  Refused: ${problem}. Try again.`);
    continue;
  }
  if ((await askHidden("Same password again: ")) === password) break;
  console.log("  The two passwords differ. Try again.");
}

// --- Writes ------------------------------------------------------------------------------
const { data: created, error: userError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
password = null;
if (userError) stop(`Supabase did not create the account (${userError.code ?? userError.status})`);
const id = created.user.id;

const { error: profileError } = await admin.from("profiles").insert({
  id,
  school_id: null,
  role_id: role.id,
  full_name: fullName,
  email,
  locale,
  must_change_password: false,
});
if (profileError) {
  // No half-created account: remove the sign-in account again.
  const { error: undoError } = await admin.auth.admin.deleteUser(id);
  stop(`the profile was refused (${profileError.code}); the account was ${undoError ? `NOT removed (${undoError.code}): remove ${id} by hand` : "removed again"}`);
}

const { error: auditError } = await admin.from("audit_logs").insert({
  school_id: null,
  actor_id: null,
  action: "platform_owner.create",
  entity: "profile",
  entity_id: id,
  // Never the password.
  data: { full_name: fullName, email, locale, via: "scripts/prod/create-platform-owner.mjs" },
});

const { count: after } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role_id", role.id);
console.log(`\nCreated: platform owner ${id} <${email}>. Platform owners on production now: ${after}.`);
if (auditError) console.log(`Warning: the audit row was not written (${auditError.code}).`);
console.log("Sign in on the production site once Vercel points at it (next part of step 1).");
