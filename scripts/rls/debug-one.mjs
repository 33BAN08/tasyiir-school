// Runs ONE suite (Server Action or database) with fresh fixtures (debugging aid):
//   node --env-file=.env.local --experimental-strip-types scripts/rls/debug-one.mjs <module> <export>
// First: refuses to go on against production (see guard.mjs).
import "./guard.mjs";

import { report } from "./checks.mjs";
import { anon, createFixtures, removeFixtures, signIn } from "./fixtures.mjs";

const [file, name] = process.argv.slice(2);
const baseUrl = process.env.TEST_APP_URL ?? "http://localhost:3000";
const fx = await createFixtures();
try {
  const mod = await import(`./${file}`);
  // Database suites take signed-in clients (as run.mjs builds them).
  const as = { anon: anon() };
  for (const user of ["dirA", "survA", "deactA", "radA", "tchA", "mgrA", "audA", "dirB", "dirC", "owner"]) {
    as[user] = await signIn(fx.users[user]);
  }
  await mod[name]({ fx, as, baseUrl });
} catch (error) {
  console.error("aborted:", error.stack);
} finally {
  report();
  const left = await removeFixtures(fx);
  if (left.length) console.error("Cleanup incomplete:", left.join(", "));
}
