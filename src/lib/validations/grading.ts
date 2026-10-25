import { z } from "zod";

// Grading setup forms (Phase 11 step 2). Error messages are next-intl keys
// under `grading.errors`.

export const gradingIdSchema = z.uuid({ error: "notFound" });

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "invalidDate" });

/** A number typed in a text box ("1,5" accepted, as French writes it), 2 decimals at most. */
const decimal = (error: string) =>
  z
    .union([z.string(), z.number()], { error })
    .transform((v) => (typeof v === "string" ? Number(v.trim().replace(",", ".")) : v))
    .pipe(z.number({ error }).refine((n) => Number.isFinite(n) && Math.abs(Math.round(n * 100) - n * 100) < 1e-6, { error }));

const whole = (min: number, max: number, error: string) =>
  z.coerce.number<string | number>({ error }).int({ error }).min(min, { error }).max(max, { error });

export const periodSchema = z
  .object({
    startDate: isoDate,
    endDate: isoDate,
    weight: decimal("weightRange").refine((n) => n > 0 && n <= 10, { error: "weightRange" }),
  })
  .superRefine((v, ctx) => {
    if (v.endDate < v.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "endBeforeStart" });
  });
export type PeriodFormValues = z.input<typeof periodSchema>;

export const levelRulesSchema = z.object({
  scale: z.union([z.literal(10), z.literal(20)], { error: "scaleInvalid" }),
  controlsCount: whole(1, 10, "controlsRange"),
  activities: z.boolean(),
});
export type LevelRulesValues = z.input<typeof levelRulesSchema>;

/** One changed cell of the coefficient grid: coefficient null = no row (not graded / back to the common value). */
export const gridCellSchema = z.object({
  levelId: gradingIdSchema,
  trackId: gradingIdSchema.nullable(),
  subjectId: gradingIdSchema,
  coefficient: decimal("coefficientRange")
    .refine((n) => n > 0 && n <= 20, { error: "coefficientRange" })
    .nullable(),
  controlsCount: z
    .union([z.string(), z.number(), z.null()], { error: "controlsRange" })
    .transform((v) => (v === null || (typeof v === "string" && v.trim() === "") ? null : Number(v)))
    .pipe(z.number({ error: "controlsRange" }).int({ error: "controlsRange" }).min(1, { error: "controlsRange" }).max(10, { error: "controlsRange" }).nullable()),
  position: z.number({ error: "generic" }).int({ error: "generic" }).min(0, { error: "generic" }).max(100, { error: "generic" }),
});
export type GridCell = z.input<typeof gridCellSchema>;

export const gridCellsSchema = z.array(gridCellSchema).max(500, { error: "tooManyCells" });
