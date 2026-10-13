import { z } from "zod";

import { CYCLES } from "@/lib/structure/level-template";

// School structure forms (Phase 4). Error messages are next-intl keys under
// `setup.errors`.

export const structureIdSchema = z.uuid();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "invalidDate" });

export const academicYearSchema = z
  .object({
    label: z.string().trim().min(1, { error: "labelRequired" }).max(40, { error: "tooLong" }),
    startDate: isoDate,
    endDate: isoDate,
  })
  .superRefine((v, ctx) => {
    // ISO dates compare correctly as strings. Same rule as the database:
    // after the start, and less than one year later.
    if (v.endDate <= v.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "endBeforeStart" });
    } else if (v.endDate >= `${Number(v.startDate.slice(0, 4)) + 1}${v.startDate.slice(4)}`) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "yearTooLong" });
    }
  });
export type AcademicYearFormValues = z.input<typeof academicYearSchema>;

export const levelSchema = z.object({
  name: z.string().trim().min(1, { error: "nameRequired" }).max(30, { error: "tooLong" }),
  cycle: z.enum(CYCLES, { error: "cycleRequired" }),
});
export type LevelFormValues = z.input<typeof levelSchema>;

export const trackSchema = z.object({
  name: z.string().trim().min(1, { error: "nameRequired" }).max(60, { error: "tooLong" }),
});
export type TrackFormValues = z.input<typeof trackSchema>;

/** What the director kept from the Moroccan template: level names + track keys. */
export const templateSelectionSchema = z.object({
  levels: z.array(z.string()).max(50, { error: "generic" }),
  tracks: z.array(z.string()).max(100, { error: "generic" }),
});

export const moveDirectionSchema = z.enum(["up", "down"]);

/**
 * Moroccan school year starting in September of `startYear`:
 * label "2026-2027", 1 September → 30 June.
 */
export function moroccanSchoolYear(startYear: number): AcademicYearFormValues {
  return {
    label: `${startYear}-${startYear + 1}`,
    startDate: `${startYear}-09-01`,
    endDate: `${startYear + 1}-06-30`,
  };
}
