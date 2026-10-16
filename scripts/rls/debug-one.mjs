// Runs ONE Server Action suite with fresh fixtures (debugging aid):
//   node --env-file=.env.local --experimental-strip-types scripts/rls/debug-one.mjs <module> <export>
import { report } from "./checks.mjs";
import { createFixtures, removeFixtures } from "./fixtures.mjs";

const [file, name] = process.argv.slice(2);
const baseUrl = process.env.TEST_APP_URL ?? "http://localhost:3000";
const fx = await createFixtures();
try {
  const mod = await import(`./${file}`);
  await mod[name]({ fx, baseUrl });
} catch (error) {
  console.error("aborted:", error.stack);
} finally {
  report();
  const left = await removeFixtures(fx);
  if (left.length) console.error("Cleanup incomplete:", left.join(", "));
}
