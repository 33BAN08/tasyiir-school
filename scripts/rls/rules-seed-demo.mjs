// The demo seed script (scripts/prod/seed-demo-school.mjs) really started with fake settings (no
// .env file): every refusal happens before any network call ("Demo school on …" is printed only
// once it starts reading), exits 1 with STOPPED, and never shows DEMO_PASSWORD.
import { spawnSync } from "node:child_process";

import { check } from "./checks.mjs";
import { DEV_REF, PRODUCTION_REF } from "./guard.mjs";

const PASSWORD = "Mot2PasseSecretRls9"; // valid by the app's rules; must never appear in any output
const base = { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "" };
const DEV = {
  ...base,
  NEXT_PUBLIC_SUPABASE_URL: `https://${DEV_REF}.supabase.co`,
  SUPABASE_SECRET_KEY: "sb_secret_fake",
  DEMO_PASSWORD: PASSWORD,
};
const PROD = {
  ...base,
  PROD_SUPABASE_URL: `https://${PRODUCTION_REF}.supabase.co`,
  PROD_SUPABASE_SECRET_KEY: "sb_secret_fake",
  DEMO_PASSWORD: PASSWORD,
};

function run(args, env) {
  const child = spawnSync(process.execPath, ["scripts/prod/seed-demo-school.mjs", ...args], {
    env,
    encoding: "utf8",
    timeout: 30000,
    stdio: ["ignore", "pipe", "pipe"], // no terminal: production must refuse without one
  });
  return { status: child.status, out: `${child.stdout ?? ""}${child.stderr ?? ""}` };
}

for (const [label, args, env, reason] of [
  ["no target", [], DEV, "exactly one target"],
  ["both targets", ["--dev", "--production"], DEV, "exactly one target"],
  ["--refresh with --remove", ["--dev", "--refresh", "--remove"], DEV, "at most one"],
  ["unknown option", ["--dev", "--force"], DEV, "unknown option"],
  ["--production with DEV settings", ["--production"], DEV, "not the production project"],
  ["--dev with the production URL", ["--dev"], { ...DEV, NEXT_PUBLIC_SUPABASE_URL: PROD.PROD_SUPABASE_URL }, "not the DEV project"],
  ["--dev with PROD_* loaded", ["--dev"], { ...DEV, PROD_SUPABASE_SECRET_KEY: "sb_secret_x" }, "PROD_"],
  ["--dev with a publishable key as secret", ["--dev"], { ...DEV, SUPABASE_SECRET_KEY: "sb_publishable_x" }, "not a secret key"],
  ["no DEMO_PASSWORD", ["--dev"], { ...DEV, DEMO_PASSWORD: "" }, "DEMO_PASSWORD is not set"],
  ["DEMO_PASSWORD too short", ["--dev"], { ...DEV, DEMO_PASSWORD: "Ab1cdXy" }, "at least 8"],
  ["DEMO_PASSWORD without a digit", ["--dev"], { ...DEV, DEMO_PASSWORD: "MotDePasseSansChiffre" }, "one letter and one digit"],
  ["--production without a terminal", ["--production"], PROD, "your own terminal"],
  ["--production --refresh without a terminal", ["--production", "--refresh"], PROD, "your own terminal"],
  ["--dev --remove without a terminal", ["--dev", "--remove"], DEV, "your own terminal"],
]) {
  const { status, out } = run(args, env);
  check(
    `[seed demo] ${label}: stopped before any network call`,
    status === 1 && out.includes("STOPPED") && out.includes(reason) && !out.includes("Demo school on"),
    `exit ${status}`,
  );
  check(
    `[seed demo] ${label}: DEMO_PASSWORD never shown`,
    !out.includes(env.DEMO_PASSWORD || PASSWORD) && !out.includes(PASSWORD),
    "",
  );
}
