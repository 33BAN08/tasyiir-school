// RLS test suite: `npm run test:rls` (reads .env.local).
// Creates temporary schools/users, runs every check as real signed-in users,
// then deletes everything it created. Exit code 1 if any check fails.
import { report } from "./checks.mjs";
import { anon, createFixtures, removeFixtures, signIn } from "./fixtures.mjs";
import { phase2 } from "./phase2.mjs";
import { phase3 } from "./phase3.mjs";

let fx;
let failed = 1;
try {
  fx = await createFixtures();
  const as = { anon: anon() };
  for (const name of ["dirA", "survA", "deactA", "dirB", "dirC", "owner"]) {
    as[name] = await signIn(fx.users[name]);
  }

  await phase2({ fx, as });
  await phase3({ fx, as });
  failed = report();
} catch (error) {
  console.error("RLS test run aborted:", error.message);
} finally {
  if (fx) {
    const leftovers = await removeFixtures(fx);
    if (leftovers.length) console.error("Cleanup incomplete, remove manually:", leftovers.join(", "));
  }
}
process.exit(failed ? 1 : 0);
