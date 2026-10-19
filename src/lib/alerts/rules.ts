import "server-only";

import { createClient } from "@/lib/supabase/server";
import { ALERT_RECIPIENTS, type AlertRecipient, type AlertRulesValues } from "@/lib/validations/alerts";

export type AlertRules = AlertRulesValues & {
  /** Last change of either rule, or null while both are the defaults. */
  lastChange: { at: string; byName: string | null } | null;
};

function toRecipients(list: string[]): AlertRecipient[] {
  return ALERT_RECIPIENTS.filter((r) => list.includes(r));
}

/**
 * The school's two alert rules (seeded with the school). Null when RLS hides
 * them: alerts module off, or no alerts.manage.
 */
export async function getAlertRules(schoolId: string): Promise<AlertRules | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("alert_rules")
    .select("type, enabled, threshold, window_days, recipients, updated_at, updated_by")
    .eq("school_id", schoolId);
  if (error) throw new Error(`getAlertRules failed: ${error.code}`);

  const absences = data.find((r) => r.type === "unjustified_absences");
  const lateness = data.find((r) => r.type === "repeated_lateness");
  if (!absences || !lateness) return null;

  const changed = [absences, lateness]
    .filter((r) => r.updated_by !== null)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  let byName: string | null = null;
  if (changed?.updated_by) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", changed.updated_by)
      .maybeSingle();
    byName = profile?.full_name ?? null;
  }

  return {
    unjustifiedAbsences: {
      enabled: absences.enabled,
      threshold: absences.threshold,
      recipients: toRecipients(absences.recipients),
    },
    repeatedLateness: {
      enabled: lateness.enabled,
      threshold: lateness.threshold,
      windowDays: lateness.window_days ?? 14,
      recipients: toRecipients(lateness.recipients),
    },
    lastChange: changed ? { at: changed.updated_at, byName } : null,
  };
}
