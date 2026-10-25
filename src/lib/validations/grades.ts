import { z } from "zod";

// Grade sheet (Phase 11 step 4). Error messages are next-intl keys under
// `grades.errors`. The scale and the number of contrôles are checked by the
// database trigger (it knows the level); here only the shapes.

export const gradeIdSchema = z.uuid({ error: "notFound" });

export const gradeCellSchema = z
  .object({
    studentId: gradeIdSchema,
    kind: z.enum(["control", "activities"], { error: "generic" }),
    number: z.number({ error: "generic" }).int({ error: "generic" }).min(1, { error: "generic" }).max(10, { error: "generic" }),
    score: z
      .number({ error: "invalidMark" })
      .min(0, { error: "invalidMark" })
      .max(20, { error: "invalidMark" })
      .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, { error: "invalidMark" })
      .nullable(),
    absent: z.boolean(),
    clear: z.boolean(),
  })
  .refine((c) => c.clear || c.absent || c.score !== null, { error: "invalidMark" });

export const gradeCellsSchema = z.array(gradeCellSchema).max(2000, { error: "tooMany" });
