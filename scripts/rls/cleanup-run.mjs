// Removes the fixtures of an interrupted test run (debugging aid):
//   node --env-file=.env.local scripts/rls/cleanup-run.mjs <run id>
// The run id is the 8 hex characters in the leftover school slugs (rls-test-a-<run>).
// Removes those schools' Storage files, the run's accounts (rls-test+<run>-*) and the schools.
// First: refuses to go on against production (see guard.mjs).
import "./guard.mjs";

import { admin, removeFixtures } from "./fixtures.mjs";

const run = process.argv[2];
if (!/^[0-9a-f]{8}$/.test(run ?? "")) throw new Error("usage: cleanup-run.mjs <8-hex run id>");

const { data: schools } = await admin.from("schools").select("id").like("slug", `rls-test-%-${run}`);
const schoolIds = (schools ?? []).map((s) => s.id);

// Storage files live outside the database rows: remove them per school folder.
let files = 0;
for (const bucket of ["student-photos", "justifications"]) {
  for (const school of schoolIds) {
    const { data: folders } = await admin.storage.from(bucket).list(school);
    for (const folder of folders ?? []) {
      const { data: objects } = await admin.storage.from(bucket).list(`${school}/${folder.name}`);
      const paths = (objects ?? []).map((o) => `${school}/${folder.name}/${o.name}`);
      if (paths.length) {
        await admin.storage.from(bucket).remove(paths);
        files += paths.length;
      }
    }
  }
}

const users = [];
for (let page = 1; ; page++) {
  const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  users.push(...data.users.filter((u) => u.email?.startsWith(`rls-test+${run}-`)).map((u) => u.id));
  if (data.users.length < 1000) break;
}
let left = await removeFixtures({ createdSchoolIds: schoolIds, createdUserIds: users });
// Accounts still referenced by the schools' rows (attendance taken by them…) can only go once the schools are gone.
if (left.length) left = await removeFixtures({ createdSchoolIds: [], createdUserIds: users });
console.log(`run ${run}: ${schoolIds.length} schools, ${users.length} accounts, ${files} files removed; left over: ${left.length ? left.join(", ") : "none"}`);
