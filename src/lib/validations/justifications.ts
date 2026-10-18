import { z } from "zod";

import { dayCount, MAX_DAYS } from "@/lib/justifications/rules";

// Justification forms (Phase 7). Error messages are `portal.absences.errors` keys.
// The range against the school's today is checked on the server (the database's date).

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "invalidDate" });

export const justificationSchema = z
  .object({
    fromDate: isoDate,
    toDate: isoDate,
    reason: z.string().trim().min(1, { error: "reasonRequired" }).max(500, { error: "tooLong" }),
  })
  .superRefine((v, ctx) => {
    if (v.toDate < v.fromDate) ctx.addIssue({ code: "custom", path: ["toDate"], message: "endBeforeStart" });
    else if (dayCount(v.fromDate, v.toDate) > MAX_DAYS) ctx.addIssue({ code: "custom", path: ["toDate"], message: "tooManyDays" });
  });
export type JustificationFormValues = z.input<typeof justificationSchema>;
