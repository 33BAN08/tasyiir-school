// The production guard (guard.mjs): its rules, then each entry point really started
// against PRODUCTION with fake keys, which must stop before any network call.
import { spawnSync } from "node:child_process";

import { check } from "./checks.mjs";
import { DEV_REF, PRODUCTION_REF, guardProblems } from "./guard.mjs";

const DEV = {
  NEXT_PUBLIC_SUPABASE_URL: `https://${DEV_REF}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_dev",
  SUPABASE_SECRET_KEY: "sb_secret_dev",
};
const PROD_URL = `https://${PRODUCTION_REF}.supabase.co`;
const refused = (env) => guardProblems(env).length > 0;

check("[guard] DEV project: allowed", !refused(DEV), guardProblems(DEV).join("; "));
check("[guard] DEV + local app on 3100: allowed", !refused({ ...DEV, TEST_APP_URL: "http://localhost:3100" }), "");
check("[guard] local Supabase stack: allowed", !refused({ ...DEV, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }), "");
check("[guard] production Supabase URL: refused", refused({ ...DEV, NEXT_PUBLIC_SUPABASE_URL: PROD_URL }), "");
check(
  "[guard] production ref in any setting (e.g. a pooler URL): refused",
  refused({ ...DEV, SUPABASE_DB_URL: `postgresql://postgres.${PRODUCTION_REF}:x@aws-0-eu-west-1.pooler.supabase.com:5432/postgres` }),
  "",
);
check("[guard] production ref in capitals: refused", refused({ ...DEV, OTHER: PROD_URL.toUpperCase() }), "");
check("[guard] PROD_DB_URL loaded: refused", refused({ ...DEV, PROD_DB_URL: "postgresql://somewhere" }), "");
check("[guard] another Supabase project: refused", refused({ ...DEV, NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co" }), "");
check("[guard] no Supabase URL: refused", refused({ ...DEV, NEXT_PUBLIC_SUPABASE_URL: "" }), "");
check("[guard] deployed app as TEST_APP_URL: refused", refused({ ...DEV, TEST_APP_URL: "https://tasyiir-school.vercel.app" }), "");
check(
  "[guard] its messages never repeat a setting's value",
  guardProblems({ ...DEV, PROD_DB_URL: "postgresql://u:SECRET-VALUE@h/db" }).every((p) => !p.includes("SECRET-VALUE")),
  "",
);

// Real entry points, started with production settings and fake keys (no .env file):
// the guard must stop them with exit code 2 before they reach anything.
const prodEnv = {
  PATH: process.env.PATH ?? "",
  SystemRoot: process.env.SystemRoot ?? "",
  NEXT_PUBLIC_SUPABASE_URL: PROD_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fake",
  SUPABASE_SECRET_KEY: "sb_secret_fake",
};
for (const [script, args] of [
  ["run.mjs", []],
  ["run.mjs", ["--actions"]],
  ["debug-one.mjs", ["actions-demo-requests.mjs", "demoRequestActions"]],
  ["cleanup-run.mjs", ["00000000"]],
]) {
  const child = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", `scripts/rls/${script}`, ...args],
    { env: prodEnv, encoding: "utf8", timeout: 30000 },
  );
  check(
    `[guard] ${[script, ...args].join(" ")} against production: stopped by the guard`,
    child.status === 2 && child.stderr.includes("REFUSED") && !child.stdout.includes("PASS"),
    `exit ${child.status}`,
  );
}
