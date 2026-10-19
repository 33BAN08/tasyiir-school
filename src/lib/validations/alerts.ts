import { z } from "zod";

// Alert rules (Phase 8). Same limits as the alert_rules CHECKs. Error messages
// are `alertSettings.errors` keys.

export const ALERT_RECIPIENTS = ["parents", "surveillance", "director"] as const;
export type AlertRecipient = (typeof ALERT_RECIPIENTS)[number];

const recipients = z
  .array(z.enum(ALERT_RECIPIENTS, { error: "invalid" }), { error: "invalid" })
  .min(1, { error: "recipientsRequired" })
  .refine((list) => new Set(list).size === list.length, { error: "invalid" });

function whole(min: number, max: number, error: string) {
  return z.coerce.number<string | number>({ error }).int({ error }).min(min, { error }).max(max, { error });
}

export const alertRulesSchema = z.object(
  {
    /** An unjustified absence on at least `threshold` days of one calendar month. */
    unjustifiedAbsences: z.object(
      { enabled: z.boolean({ error: "invalid" }), threshold: whole(1, 20, "absenceDays"), recipients },
      { error: "invalid" },
    ),
    /** At least `threshold` lates within the last `windowDays` days. */
    repeatedLateness: z.object(
      {
        enabled: z.boolean({ error: "invalid" }),
        threshold: whole(2, 20, "lateCount"),
        windowDays: whole(7, 60, "lateWindow"),
        recipients,
      },
      { error: "invalid" },
    ),
  },
  { error: "invalid" },
);
export type AlertRulesFormValues = z.input<typeof alertRulesSchema>;
export type AlertRulesValues = z.output<typeof alertRulesSchema>;
