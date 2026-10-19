// Phase 8 step 3: /settings/alerts and saveAlertRules — the director's alert
// settings. alerts.manage only, own school, alerts module on; the action
// validates like the DB and writes through RLS with the caller's session.
// Called over HTTP as real users on the page that registers it.
import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin } from "./fixtures.mjs";

const FILE = "src/lib/alerts/actions.ts";
const PAGE = "/fr/settings/alerts";
const FORM_MARK = 'id="unjustifiedAbsences-enabled"'; // rendered only with the form

const valid = () => ({
  unjustifiedAbsences: { enabled: true, threshold: "4", recipients: ["surveillance", "parents"] },
  repeatedLateness: { enabled: false, threshold: 5, windowDays: "21", recipients: ["director"] },
});

export async function alertRuleActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const call = (cookies, ...args) => callAction(baseUrl, { id: actionId(FILE, "saveAlertRules"), path: PAGE, args, cookies });
  const get = async (cookies) => {
    const res = await fetch(new URL(PAGE, baseUrl), { headers: { cookie: cookies }, redirect: "manual" });
    return { status: res.status, html: res.status === 200 ? await res.text() : "" };
  };
  const setModule = (school, enabled) =>
    admin.from("school_modules").upsert({ school_id: school.id, module_key: "alerts", enabled }, { onConflict: "school_id,module_key" });
  const rule = async (school, type) =>
    (await admin.from("alert_rules").select("*").eq("school_id", school.id).eq("type", type).single()).data;

  const dirA = await sessionCookies(fx.users.dirA);
  const dirB = await sessionCookies(fx.users.dirB);
  const survA = await sessionCookies(fx.users.survA);

  // --- Module off (Basic) ---------------------------------------------------------------------------------
  const offPage = await get(dirA);
  check("[P8 alert actions] module off: the page opens without the form (not in your plan)",
    offPage.status === 200 && !offPage.html.includes(FORM_MARK), String(offPage.status));
  const offSave = await call(dirA, valid());
  check("[P8 alert actions] module off: saving is refused", offSave.ok === false && offSave.error === "notInPlan", JSON.stringify(offSave));
  check("[P8 alert actions] …nothing changed", (await rule(A, "unjustified_absences")).threshold === 3);

  await setModule(A, true);
  await setModule(B, true);

  // --- Page --------------------------------------------------------------------------------------------------
  const page = await get(dirA);
  check("[P8 alert actions] module on: the director sees the form", page.status === 200 && page.html.includes(FORM_MARK), String(page.status));
  const survPage = await get(survA);
  check("[P8 alert actions] a surveillant is sent home", survPage.status !== 200 || !survPage.html.includes(FORM_MARK), String(survPage.status));
  const outPage = await get("");
  check("[P8 alert actions] signed out → not the page", outPage.status !== 200 || !outPage.html.includes(FORM_MARK), String(outPage.status));

  // --- Save ----------------------------------------------------------------------------------------------------
  const saved = await call(dirA, valid());
  const absA = await rule(A, "unjustified_absences");
  const lateA = await rule(A, "repeated_lateness");
  check("[P8 alert actions] the director saves both rules",
    saved.ok === true && absA.threshold === 4 && absA.recipients.join() === "parents,surveillance"
      && lateA.enabled === false && lateA.threshold === 5 && lateA.window_days === 21 && lateA.recipients.join() === "director"
      && lateA.updated_by === fx.users.dirA.id,
    JSON.stringify(saved));
  check("[P8 alert actions] …B's rules are untouched", (await rule(B, "unjustified_absences")).threshold === 3);
  const { data: audit } = await admin.from("audit_logs").select("data").eq("school_id", A.id).eq("action", "alert_rules.update");
  check("[P8 alert actions] …and it is in the audit log", audit?.length === 1 && audit[0].data?.lateness?.days === 21, JSON.stringify(audit));

  // --- Refused values (the field is named so the form shows it) -------------------------------------------------
  const refused = async (name, change, error, field) => {
    const input = valid();
    change(input);
    const result = await call(dirA, input);
    check(`[P8 alert actions] refused: ${name}`, result.ok === false && result.error === error && result.field === field, JSON.stringify(result));
  };
  await refused("absences on 21 days", (v) => { v.unjustifiedAbsences.threshold = 21; }, "absenceDays", "unjustifiedAbsences.threshold");
  await refused("a non-whole number of days", (v) => { v.unjustifiedAbsences.threshold = "2.5"; }, "absenceDays", "unjustifiedAbsences.threshold");
  await refused("1 late", (v) => { v.repeatedLateness.threshold = 1; }, "lateCount", "repeatedLateness.threshold");
  await refused("a 90-day window", (v) => { v.repeatedLateness.windowDays = 90; }, "lateWindow", "repeatedLateness.windowDays");
  await refused("nobody to tell", (v) => { v.repeatedLateness.recipients = []; }, "recipientsRequired", "repeatedLateness.recipients");
  await refused("an unknown recipient", (v) => { v.unjustifiedAbsences.recipients = ["teachers"]; }, "invalid", "unjustifiedAbsences.recipients.0");
  const garbage = await call(dirA, "not an object");
  check("[P8 alert actions] refused: not an object", garbage.ok === false && garbage.error === "invalid", JSON.stringify(garbage));
  check("[P8 alert actions] …refused saves changed nothing", (await rule(A, "unjustified_absences")).threshold === 4);

  // --- Who may save -----------------------------------------------------------------------------------------------
  const surv = await call(survA, valid());
  check("[P8 alert actions] a surveillant cannot save", surv.ok === false && surv.error === "forbidden", JSON.stringify(surv));
  const out = await call(undefined, valid());
  check("[P8 alert actions] signed out: refused", out.ok === false, JSON.stringify(out));
  const other = valid();
  other.unjustifiedAbsences.threshold = 7;
  const savedB = await call(dirB, other);
  check("[P8 alert actions] the director of B saves only B's rules",
    savedB.ok === true && (await rule(B, "unjustified_absences")).threshold === 7 && (await rule(A, "unjustified_absences")).threshold === 4,
    JSON.stringify(savedB));

  // --- Clean up: back to the plan ---------------------------------------------------------------------------------
  await admin.from("school_modules").delete().eq("module_key", "alerts").in("school_id", [A.id, B.id]);
}
