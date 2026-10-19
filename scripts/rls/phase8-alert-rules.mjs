// Phase 8 step 3: alert_rules — one row per school per type, seeded with the
// school; read + changed only by alerts.manage (director), own school, while
// the alerts module is on; settings columns only; values within the CHECKs;
// nobody inserts / deletes rules through the API.
import { check, denied, rows } from "./checks.mjs";
import { admin } from "./fixtures.mjs";

const setModule = async (schoolId, enabled) => {
  const { error } = await admin.from("school_modules")
    .upsert({ school_id: schoolId, module_key: "alerts", enabled }, { onConflict: "school_id,module_key" });
  if (error) throw new Error(`phase8AlertRules setup: ${error.message}`);
};

export async function phase8AlertRules({ fx, as }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const C = fx.schools.c;
  const ruleOf = async (school, type) =>
    (await admin.from("alert_rules").select("*").eq("school_id", school.id).eq("type", type).single()).data;
  const absences = (client, school = A) =>
    client.from("alert_rules").update({ threshold: 4 }).eq("school_id", school.id).eq("type", "unjustified_absences").select("type");

  // --- Defaults seeded with each new school ---------------------------------------------------------------
  const { data: seeded } = await admin.from("alert_rules").select("*").in("school_id", [A.id, B.id, C.id]);
  check("[P8 alert rules] every new school gets its two rules", seeded.length === 6, `${seeded.length} rows`);
  const absA = seeded.find((r) => r.school_id === A.id && r.type === "unjustified_absences");
  const lateA = seeded.find((r) => r.school_id === A.id && r.type === "repeated_lateness");
  check("[P8 alert rules] default: unjustified absences on 3 days of a month → parents + surveillance",
    absA?.enabled && absA.threshold === 3 && absA.window_days === null && absA.recipients.join() === "parents,surveillance" && absA.updated_by === null,
    JSON.stringify(absA));
  check("[P8 alert rules] default: 3 lates in 14 days → parents",
    lateA?.enabled && lateA.threshold === 3 && lateA.window_days === 14 && lateA.recipients.join() === "parents", JSON.stringify(lateA));

  // --- Alerts module off (fixture schools are on Basic) ---------------------------------------------------
  await rows("[P8 alert rules] module off: the director reads no rule", as.dirA.from("alert_rules").select("type"), 0);
  await denied("[P8 alert rules] module off: the director changes nothing", absences(as.dirA));

  await setModule(A.id, true);
  await setModule(B.id, true);
  await setModule(C.id, true);

  // --- Reads -----------------------------------------------------------------------------------------------
  await rows("[P8 alert rules] module on: the director reads their school's two rules, none of B's",
    as.dirA.from("alert_rules").select("school_id"), (list) => list.length === 2 && list.every((r) => r.school_id === A.id));
  for (const who of ["survA", "tchA", "mgrA", "audA"]) {
    await rows(`[P8 alert rules] ${who} (no alerts.manage) reads no rule`, as[who].from("alert_rules").select("type"), 0);
  }
  const { data: anonRows, error: anonError } = await as.anon.from("alert_rules").select("type");
  check("[P8 alert rules] signed out: no rule (no grant)", anonError?.code === "42501" || anonRows?.length === 0, anonError?.code ?? `${anonRows?.length} row(s)`);
  await rows("[P8 alert rules] suspended school C: its director reads no rule", as.dirC.from("alert_rules").select("type"), 0);
  await rows("[P8 alert rules] platform owner reads no school's rules", as.owner.from("alert_rules").select("type"), 0);

  // --- Updates ---------------------------------------------------------------------------------------------
  const { data: changed, error: changeError } = await as.dirA.from("alert_rules")
    .update({ enabled: false, threshold: 5, window_days: 21, recipients: ["director", "parents", "surveillance"] })
    .eq("school_id", A.id).eq("type", "repeated_lateness").select("*");
  check("[P8 alert rules] the director changes a rule (recipients stored in a fixed order, who + when recorded)",
    !changeError && changed?.length === 1 && changed[0].enabled === false && changed[0].threshold === 5 && changed[0].window_days === 21
      && changed[0].recipients.join() === "parents,surveillance,director" && changed[0].updated_by === fx.users.dirA.id,
    changeError?.code ?? JSON.stringify(changed));
  const { data: dup } = await as.dirA.from("alert_rules").update({ recipients: ["parents", "parents"] })
    .eq("school_id", A.id).eq("type", "repeated_lateness").select("recipients");
  check("[P8 alert rules] a recipient given twice is kept once", dup?.[0]?.recipients.join() === "parents", JSON.stringify(dup));

  await denied("[P8 alert rules] the director of A cannot change B's rules", absences(as.dirA, B));
  check("[P8 alert rules] …B's rule is unchanged", (await ruleOf(B, "unjustified_absences")).threshold === 3);
  await denied("[P8 alert rules] the director of B cannot change A's rules", absences(as.dirB, A));
  await denied("[P8 alert rules] a surveillant cannot change a rule", absences(as.survA));
  await denied("[P8 alert rules] a teacher cannot change a rule", absences(as.tchA));
  await denied("[P8 alert rules] suspended school C: its director cannot change a rule", absences(as.dirC, C));

  // Values outside the limits.
  const refused = async (name, type, values) => {
    const { error } = await as.dirA.from("alert_rules").update(values).eq("school_id", A.id).eq("type", type).select("type");
    check(`[P8 alert rules] refused: ${name}`, error?.code === "23514", error?.code ?? "accepted!");
  };
  await refused("absences on 0 days", "unjustified_absences", { threshold: 0 });
  await refused("absences on 21 days", "unjustified_absences", { threshold: 21 });
  await refused("a window for the absences rule (it is the calendar month)", "unjustified_absences", { window_days: 14 });
  await refused("1 late (repeated = at least 2)", "repeated_lateness", { threshold: 1 });
  await refused("lateness over 6 days", "repeated_lateness", { window_days: 6 });
  await refused("lateness over 61 days", "repeated_lateness", { window_days: 61 });
  await refused("lateness without a window", "repeated_lateness", { window_days: null });
  await refused("nobody to tell", "repeated_lateness", { recipients: [] });
  await refused("an unknown recipient", "repeated_lateness", { recipients: ["parents", "teachers"] });

  // Columns that are not settings, inserts, deletes.
  await denied("[P8 alert rules] the type cannot be changed",
    as.dirA.from("alert_rules").update({ type: "repeated_lateness" }).eq("school_id", A.id).eq("type", "unjustified_absences").select("type"));
  await denied("[P8 alert rules] a rule cannot be moved to another school",
    as.dirA.from("alert_rules").update({ school_id: B.id }).eq("school_id", A.id).eq("type", "unjustified_absences").select("type"));
  await denied("[P8 alert rules] who changed it cannot be forged",
    as.dirA.from("alert_rules").update({ updated_by: fx.users.survA.id }).eq("school_id", A.id).eq("type", "unjustified_absences").select("type"));
  await denied("[P8 alert rules] the director cannot delete a rule",
    as.dirA.from("alert_rules").delete().eq("school_id", A.id).select("type"));
  check("[P8 alert rules] …both rules of A are still there", (await admin.from("alert_rules").select("type").eq("school_id", A.id)).data.length === 2);
  await denied("[P8 alert rules] nobody inserts a rule",
    as.dirA.from("alert_rules").insert({ school_id: A.id, type: "repeated_lateness", threshold: 3, window_days: 14, recipients: ["parents"] }).select("type"));
  const { error: typeError } = await admin.from("alert_rules")
    .insert({ school_id: A.id, type: "grades", threshold: 3, recipients: ["parents"] });
  check("[P8 alert rules] an unknown alert type is refused (even with the secret key)", typeError?.code === "23514" || typeError?.code === "23505", typeError?.code ?? "accepted!");

  // --- Module turned off again: the settings are kept but closed ---------------------------------------------
  await setModule(A.id, false);
  await rows("[P8 alert rules] module turned off: the director reads no rule again", as.dirA.from("alert_rules").select("type"), 0);
  await denied("[P8 alert rules] …and changes nothing", absences(as.dirA));
  check("[P8 alert rules] …the rules are kept (seen with the secret key)", (await ruleOf(A, "repeated_lateness")).threshold === 5);

  // --- Clean up: back to the plan, back to the defaults ---------------------------------------------------------
  await admin.from("school_modules").delete().eq("module_key", "alerts").in("school_id", [A.id, B.id, C.id]);
  await admin.from("alert_rules").update({ enabled: true, threshold: 3, window_days: 14, recipients: ["parents"] })
    .eq("school_id", A.id).eq("type", "repeated_lateness");
}
