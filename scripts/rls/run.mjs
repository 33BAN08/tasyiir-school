// Security test suite (reads .env.local):
//   npm run test:rls      — database checks (RLS, grants, constraints) + rule unit checks
//   npm run test:actions  — the same + Server Actions over HTTP; needs the app
//                           running (`npm run build && npm start`), at
//                           TEST_APP_URL (default http://localhost:3000)
// Creates temporary schools/users, runs every check as real signed-in users,
// then deletes everything it created. Exit code 1 if any check fails.
import { staffActions } from "./actions-staff.mjs";
import { staffMemberActions } from "./actions-staff-member.mjs";
import { roleActions } from "./actions-roles.mjs";
import { yearActions } from "./actions-years.mjs";
import { levelActions } from "./actions-levels.mjs";
import { classActions } from "./actions-classes.mjs";
import { subjectActions } from "./actions-subjects.mjs";
import { report } from "./checks.mjs";
import { anon, createFixtures, removeFixtures, signIn } from "./fixtures.mjs";
import { phase2 } from "./phase2.mjs";
import { phase3 } from "./phase3.mjs";
import { phase3Guards } from "./phase3-guards.mjs";
import { phase4 } from "./phase4.mjs";
import { phase4Levels } from "./phase4-levels.mjs";
import { phase4Classes } from "./phase4-classes.mjs";
import { phase4Subjects } from "./phase4-subjects.mjs";
import { phase4TimeSlots } from "./phase4-time-slots.mjs";
import { timeSlotActions } from "./actions-time-slots.mjs";
import { phase5Students } from "./phase5-students.mjs";
import { studentActions } from "./actions-students.mjs";
import { phase5Photos } from "./phase5-photos.mjs";
import { photoActions } from "./actions-photos.mjs";
import { phase5Guardians } from "./phase5-guardians.mjs";
import { parentActions } from "./actions-parents.mjs";
import { studentGuardianActions } from "./actions-student-guardians.mjs";
import { phase5Teachers } from "./phase5-teachers.mjs";
import { teacherActions } from "./actions-teachers.mjs";
import { phase5Import } from "./phase5-import.mjs";
import { importCommitActions, importPreviewActions } from "./actions-import.mjs";
import { phase6Lessons } from "./phase6-lessons.mjs";
import { lessonBlockActions } from "./actions-lesson-blocks.mjs";
import { lessonActions } from "./actions-lessons.mjs";

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
  for (const name of ["dirA", "survA", "deactA", "radA", "tchA", "mgrA", "audA", "dirB", "dirC", "owner"]) {
    as[name] = await signIn(fx.users[name]);
  }

  await phase2({ fx, as });
  await phase3({ fx, as });
  await phase3Guards({ fx, as });
  await phase4({ fx, as });
  await phase4Levels({ fx, as });
  await phase4Classes({ fx, as });
  await phase4Subjects({ fx, as });
  await phase4TimeSlots({ fx, as });
  await phase5Students({ fx, as });
  await phase5Photos({ fx, as });
  await phase5Guardians({ fx, as });
  await phase5Teachers({ fx, as });
  await phase5Import({ fx, as });
  await phase6Lessons({ fx, as });
  await import("./rules.mjs");
  await import("./rules-phone.mjs");
  await import("./rules-import.mjs");
  await import("./rules-timetable.mjs");
  if (withActions) {
    await staffMemberActions({ fx, baseUrl });
    await roleActions({ fx, baseUrl });
    await yearActions({ fx, baseUrl });
    await levelActions({ fx, baseUrl });
    await classActions({ fx, baseUrl });
    await subjectActions({ fx, baseUrl });
    await timeSlotActions({ fx, baseUrl });
    await studentActions({ fx, baseUrl });
    await photoActions({ fx, baseUrl });
    await parentActions({ fx, baseUrl });
    await studentGuardianActions({ fx, baseUrl });
    await teacherActions({ fx, baseUrl });
    await importPreviewActions({ fx, baseUrl });
    await importCommitActions({ fx, baseUrl });
    await lessonBlockActions({ fx, baseUrl });
    await lessonActions({ fx, baseUrl });
    await staffActions({ fx, baseUrl }); // last: it deactivates mgrA
  }
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
