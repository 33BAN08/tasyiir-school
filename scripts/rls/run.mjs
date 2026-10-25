// Security test suite (reads .env.local):
//   npm run test:rls      — database checks (RLS, grants, constraints) + rule unit checks
//   npm run test:actions  — the same + Server Actions over HTTP; needs the app
//                           running (`npm run build && npm start`), at
//                           TEST_APP_URL (default http://localhost:3000)
// Creates temporary schools/users, runs every check as real signed-in users,
// then deletes everything it created. Exit code 1 if any check fails.
// First: refuses to go on against production (see guard.mjs).
import "./guard.mjs";

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
import { phase6Copy } from "./phase6-copy.mjs";
import { phase6CrossSchool } from "./phase6-cross-school.mjs";
import { phase7Attendance } from "./phase7-attendance.mjs";
import { phase7Justifications } from "./phase7-justifications.mjs";
import { phase7CrossSchool } from "./phase7-cross-school.mjs";
import { phase8Notifications } from "./phase8-notifications.mjs";
import { phase8AlertRules } from "./phase8-alert-rules.mjs";
import { phase8DailyAlerts } from "./phase8-daily-alerts.mjs";
import { phase8SubscriptionReminders } from "./phase8-subscription-reminders.mjs";
import { phase8CrossSchool } from "./phase8-cross-school.mjs";
import { announcementActions } from "./actions-announcements.mjs";
import { phase9Remarks } from "./phase9-remarks.mjs";
import { remarkActions } from "./actions-remarks.mjs";
import { phase9SchoolContacts } from "./phase9-school-contacts.mjs";
import { planLimitActions } from "./actions-plan-limits.mjs";
import { phaseLaunchLimits } from "./phase-launch-limits.mjs";
import { phaseLaunchDemo } from "./phase-launch-demo.mjs";
import { phaseLaunchTrial } from "./phase-launch-trial.mjs";
import { phase10Push } from "./phase10-push.mjs";
import { phase10PushSend } from "./phase10-push-send.mjs";
import { phase10PushPreferences } from "./phase10-push-preferences.mjs";
import { phase10CrossSchool } from "./phase10-cross-school.mjs";
import { phase11GradingSetup } from "./phase11-grading-setup.mjs";
import { phase11CopyGrading } from "./phase11-copy-grading.mjs";
import { demoActions } from "./actions-demo.mjs";
import { phase9CrossSchool } from "./phase9-cross-school.mjs";
import { schoolContactActions } from "./actions-school-contact.mjs";
import { phase9Announcements } from "./phase9-announcements.mjs";
import { notificationTypes } from "./notification-types.mjs";
import { publicDemoRequests } from "./public-demo-requests.mjs";
import { demoRequestActions } from "./actions-demo-requests.mjs";
import { trialActions } from "./actions-trial.mjs";
import { phoneAppPages } from "./pages-phone-app.mjs";
import { pushDeliverActions } from "./actions-push-deliver.mjs";
import { pushPreferencesActions } from "./actions-push-preferences.mjs";
import { gradingSetupActions } from "./actions-grading-setup.mjs";
import { phase6Lessons } from "./phase6-lessons.mjs";
import { lessonBlockActions } from "./actions-lesson-blocks.mjs";
import { lessonCopyActions } from "./actions-lesson-copy.mjs";
import { timetablePages } from "./pages-timetable.mjs";
import { timetablePrintPages } from "./pages-timetable-print.mjs";
import { rollCallActions } from "./actions-roll-call.mjs";
import { absencesActions } from "./actions-absences.mjs";
import { notificationActions } from "./actions-notifications.mjs";
import { alertRuleActions } from "./actions-alert-rules.mjs";
import { justificationActions } from "./actions-justifications.mjs";
import { staffJustificationActions } from "./actions-staff-justifications.mjs";
import { lessonMoveActions } from "./actions-lesson-moves.mjs";
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
  await phase6Copy({ fx, as });
  await phase6CrossSchool({ fx, as });
  await phase7Attendance({ fx, as });
  await phase7Justifications({ fx, as });
  await phase7CrossSchool({ fx, as });
  await phase8Notifications({ fx, as });
  await phase8AlertRules({ fx, as });
  await phase8DailyAlerts({ fx, as });
  await phase8SubscriptionReminders({ fx, as });
  await phase8CrossSchool({ fx, as });
  await phase9Announcements({ fx, as });
  await phase9Remarks({ fx, as });
  await phase9SchoolContacts({ fx, as });
  await phaseLaunchLimits({ fx, as });
  await phaseLaunchDemo({ fx, as });
  await phaseLaunchTrial({ fx, as });
  await phase10Push({ fx, as });
  await phase10PushSend({ fx, as });
  await phase10PushPreferences({ fx, as });
  await phase10CrossSchool({ fx, as });
  await phase9CrossSchool({ fx, as });
  await phase11GradingSetup({ fx, as });
  await phase11CopyGrading({ fx, as });
  await notificationTypes({ fx, as });
  await publicDemoRequests({ fx, as });
  await import("./rules.mjs");
  await import("./rules-phone.mjs");
  await import("./rules-import.mjs");
  await import("./rules-timetable-now.mjs");
  await import("./rules-test-guard.mjs");
  await import("./rules-seed-demo.mjs");
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
    await lessonMoveActions({ fx, baseUrl });
    await lessonCopyActions({ fx, baseUrl });
    await timetablePages({ fx, baseUrl });
    await timetablePrintPages({ fx, baseUrl });
    await rollCallActions({ fx, baseUrl });
    await absencesActions({ fx, baseUrl });
    await justificationActions({ fx, baseUrl });
    await staffJustificationActions({ fx, baseUrl });
    await notificationActions({ fx, baseUrl });
    await alertRuleActions({ fx, baseUrl });
    await announcementActions({ fx, baseUrl });
    await remarkActions({ fx, baseUrl });
    await schoolContactActions({ fx, baseUrl });
    await planLimitActions({ fx, baseUrl });
    await demoActions({ fx, baseUrl });
    await demoRequestActions({ fx, baseUrl });
    await trialActions({ fx, baseUrl });
    await phoneAppPages({ baseUrl });
    await pushDeliverActions({ fx, baseUrl });
    await pushPreferencesActions({ fx, baseUrl });
    await gradingSetupActions({ fx, baseUrl });
    await staffActions({ fx, baseUrl }); // last: it deactivates mgrA
  }
  failed = report();
  if (!withActions) console.log("(Server Action checks skipped: run npm run test:actions with the app running)");
} catch (error) {
  console.error("Security test run aborted:", error.stack);
} finally {
  if (fx) {
    const leftovers = await removeFixtures(fx);
    if (leftovers.length) console.error("Cleanup incomplete, remove manually:", leftovers.join(", "));
  }
}
process.exit(failed ? 1 : 0);
