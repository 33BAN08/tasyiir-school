// Refuses to run any test suite against PRODUCTION. Imported FIRST by every entry
// point (run.mjs, debug-one.mjs, cleanup-run.mjs) and by fixtures.mjs / app.mjs, so it
// runs before a single Supabase client exists. The suites create and delete schools,
// accounts and files with the secret key: they may only ever touch DEV (or a local stack).

export const DEV_REF = "ndnfeioxagdjjulmjonz";
export const PRODUCTION_REF = "blycnuuomfqgvfczkbxc";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function hostOf(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

/** Why these settings must not run the suites ([] = allowed). Never echoes a value. */
export function guardProblems(env) {
  const problems = [];

  // Any setting that names the production project: a loaded production env file.
  for (const [name, value] of Object.entries(env)) {
    if (typeof value === "string" && value.toLowerCase().includes(PRODUCTION_REF)) {
      problems.push(`${name} points at the PRODUCTION project`);
    }
  }
  if (env.PROD_DB_URL) problems.push("PROD_DB_URL is set: the production env file is loaded");

  // Supabase: the DEV project, or a local stack; nothing else.
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const host = url ? hostOf(url) : null;
  if (!url) problems.push("NEXT_PUBLIC_SUPABASE_URL is not set");
  else if (!host) problems.push("NEXT_PUBLIC_SUPABASE_URL is not a URL");
  else if (host !== `${DEV_REF}.supabase.co` && !LOCAL_HOSTS.has(host)) {
    problems.push(`NEXT_PUBLIC_SUPABASE_URL is not the DEV project (${DEV_REF}) or a local stack`);
  }

  // The app the Server Action suites call: a local build only, never a deployment.
  if (env.TEST_APP_URL) {
    const appHost = hostOf(env.TEST_APP_URL);
    if (!appHost || !LOCAL_HOSTS.has(appHost)) problems.push("TEST_APP_URL is not a local app (localhost / 127.0.0.1)");
  }

  return problems;
}

const problems = guardProblems(process.env);
if (problems.length) {
  console.error("REFUSED: the test suites only run against DEV.");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(2);
}
