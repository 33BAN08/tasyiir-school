"use server";

import { logAudit } from "@/lib/audit";
import { getSchoolActor } from "@/lib/auth/school-actor";
import { createClient } from "@/lib/supabase/server";
import { alertRulesSchema } from "@/lib/validations/alerts";

// The director's alert settings (alerts.manage), written through RLS with the
// caller's session: the table grants UPDATE on the settings columns only, and
// RLS also requires the alerts module. Error keys: `alertSettings.errors`.

/** `field` = the form path of the value refused (e.g. "repeatedLateness.windowDays"). */
export type AlertRulesResult = { ok: true } | { ok: false; error: string; field?: string };

export async function saveAlertRules(input: unknown): Promise<AlertRulesResult> {
  const actor = await getSchoolActor("alerts.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const parsed = alertRulesSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "invalid", field: issue?.path.join(".") || undefined };
  }
  const { unjustifiedAbsences: absences, repeatedLateness: lateness } = parsed.data;

  const supabase = await createClient();
  const updates = await Promise.all([
    supabase
      .from("alert_rules")
      .update({ enabled: absences.enabled, threshold: absences.threshold, recipients: absences.recipients })
      .eq("school_id", actor.schoolId)
      .eq("type", "unjustified_absences")
      .select("type"),
    supabase
      .from("alert_rules")
      .update({
        enabled: lateness.enabled,
        threshold: lateness.threshold,
        window_days: lateness.windowDays,
        recipients: lateness.recipients,
      })
      .eq("school_id", actor.schoolId)
      .eq("type", "repeated_lateness")
      .select("type"),
  ]);
  if (updates.some((u) => u.error)) return { ok: false, error: "failed" };
  // RLS hides the rows when the alerts module is off for the school.
  if (updates.some((u) => u.data?.length === 0)) return { ok: false, error: "notInPlan" };

  await logAudit({
    actorId: actor.id,
    schoolId: actor.schoolId,
    action: "alert_rules.update",
    entity: "alert_rules",
    data: {
      absences: { enabled: absences.enabled, days: absences.threshold, recipients: absences.recipients },
      lateness: {
        enabled: lateness.enabled,
        lates: lateness.threshold,
        days: lateness.windowDays,
        recipients: lateness.recipients,
      },
    },
  });
  return { ok: true };
}
