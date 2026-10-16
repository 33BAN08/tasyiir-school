import { z } from "zod";

import { normalizeMobile } from "@/lib/parents/phone";

import { pageParam, searchParam } from "./list-params";

// Parents / guardians (Phase 5). Error messages are next-intl keys under `parents.errors`.

export const GUARDIAN_PAGE_SIZE = 25;
export const RELATIONS = ["father", "mother", "tutor"] as const;
export type Relation = (typeof RELATIONS)[number];

export const guardianListParamsSchema = z.object({ q: searchParam, page: pageParam });
export type GuardianListParams = z.infer<typeof guardianListParamsSchema>;

export const guardianIdSchema = z.uuid();

const name = z.string().trim().min(1, { error: "nameRequired" }).max(60, { error: "tooLong" });

export const guardianSchema = z.object({
  lastName: name,
  firstName: name,
  /** Typed as "06 12 34 56 78" etc., stored as +212612345678. */
  phone: z.string().transform((v, ctx) => {
    const phone = normalizeMobile(v);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: "invalidPhone" });
      return z.NEVER;
    }
    return phone;
  }),
  /** Optional contact email ("" = none). */
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, { error: "tooLong" })
    .pipe(z.union([z.literal(""), z.email({ error: "invalidEmail" })], { error: "invalidEmail" })),
});
export type GuardianFormValues = z.input<typeof guardianSchema>;
export type GuardianInput = z.output<typeof guardianSchema>;

export const linkSchema = z.object({
  studentId: z.uuid({ error: "studentRequired" }),
  relation: z.enum(RELATIONS, { error: "relationRequired" }),
});
export type LinkFormValues = z.input<typeof linkSchema>;

export const studentSearchSchema = z.string().trim().max(100);
export const parentActiveSchema = z.boolean();

/** From a student's page: a new guardian and their relation to that student, in one form. */
export const newGuardianLinkSchema = guardianSchema.extend({
  relation: z.enum(RELATIONS, { error: "relationRequired" }),
});
export type NewGuardianLinkValues = z.input<typeof newGuardianLinkSchema>;

export const guardianSearchSchema = z.string().trim().max(100);
