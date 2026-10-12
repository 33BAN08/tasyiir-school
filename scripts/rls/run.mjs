// Security test suite (reads .env.local):
//   npm run test:rls      — database checks (RLS, grants, constraints)
//   npm run test:actions  — the same + Server Actions over HTTP; needs the app
//                           running (`npm run build && npm start`), at
//                           TEST_APP_URL (default http://localhost:3000)
// Creates temporary schools/users, runs every check as real signed-in users,
// then deletes everything it created. Exit code 1 if any check fails.
import { staffActions } from "./actions-staff.mjs";
import { report } from "./checks.mjs";
import { anon, createFixtures, removeFixtures, signIn } from "./fixtures.mjs";
import { phase2 } from "./phase2.mjs";
import { phase3 } from "./phase3.mjs";

const withActions = process.argv.includes("--actions");
const baseUrl = process.env.TEST_APP_URL ?? "http://localhost:3000";

let fx;
let failed = 1;
try {
  if (withActions) {
    const res = await fetch(new URL("/fr/login", baseUrl)).catch(() => null);
    if (!res?.ok) throw new Error(`app not reachable at ${baseUrl} (start it, or set TEST_APP_URL)`);
  }
  fx = await createFixtures();
  const as = { anon: anon() };
  for (const name of ["dirA", "survA", "deactA", "dirB", "dirC", "owner"]) {
    as[name] = await signIn(fx.users[name]);
  }

  await phase2({ fx, as });
  await phase3({ fx, as });
  if (withActions) await staffActions({ fx, baseUrl });
  failed = report();
  if (!withActions) console.log("(Server Action checks skipped: run npm run test:actions with the app running)");
} catch (error) {
  console.error("Security test run aborted:", error.message);
} finally {
  if (fx) {
    const leftovers = await removeFixtures(fx);
    if (leftovers.length) console.error("Cleanup incomplete, remove manually:", leftovers.join(", "));
  }
}
process.exit(failed ? 1 : 0);
