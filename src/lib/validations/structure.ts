import { z } from "zod";

import { MAX_BATCH_CLASSES } from "@/lib/structure/class-names";
import { CYCLES } from "@/lib/structure/level-template";
import { ROOM_TYPES } from "@/lib/structure/room-types";
import { SUBJECT_COLORS } from "@/lib/structure/subject-template";
import {
  MAX_LABEL_LENGTH,
  MAX_SLOT_MINUTES,
  normalizeTime,
  SLOT_KINDS,
  toMinutes,
} from "@/lib/structure/time-slot-template";

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

const classLevel = z.uuid({ error: "levelRequired" });
/** "" = no filière (a Select cannot hold null). */
const classTrack = z.union([z.literal(""), z.uuid()], { error: "invalidTrack" });

export const classSchema = z.object({
  levelId: classLevel,
  trackId: classTrack,
  name: z.string().trim().min(1, { error: "nameRequired" }).max(30, { error: "tooLong" }),
});
export type ClassFormValues = z.input<typeof classSchema>;

/** Several classes at once: "<prefix>-A", "<prefix>-B", … (see class-names.ts). */
export const classBatchSchema = z.object({
  levelId: classLevel,
  trackId: classTrack,
  // Room for "-A" within the 30-character class name.
  prefix: z.string().trim().min(1, { error: "nameRequired" }).max(27, { error: "tooLong" }),
  count: z.coerce
    .number<string | number>({ error: "countRange" })
    .int({ error: "countRange" })
    .min(1, { error: "countRange" })
    .max(MAX_BATCH_CLASSES, { error: "countRange" }),
});
export type ClassBatchFormValues = z.input<typeof classBatchSchema>;

export const subjectSchema = z.object({
  name: z.string().trim().min(1, { error: "nameRequired" }).max(60, { error: "tooLong" }),
  /** "" = no code. */
  code: z.string().trim().max(6, { error: "codeTooLong" }),
  color: z.enum(SUBJECT_COLORS, { error: "colorRequired" }),
});
export type SubjectFormValues = z.input<typeof subjectSchema>;

/** Template keys the director kept. */
export const subjectTemplateSelectionSchema = z.array(z.string()).max(50, { error: "generic" });

export const roomSchema = z.object({
  name: z.string().trim().min(1, { error: "nameRequired" }).max(40, { error: "tooLong" }),
  capacity: z.coerce
    .number<string | number>({ error: "capacityRange" })
    .int({ error: "capacityRange" })
    .min(1, { error: "capacityRange" })
    .max(500, { error: "capacityRange" }),
  /** "" = no type (a Select cannot hold null). */
  roomType: z.union([z.literal(""), z.enum(ROOM_TYPES)], { error: "generic" }),
});
export type RoomFormValues = z.input<typeof roomSchema>;

export const schoolDaySchema = z.number().int().min(1).max(6);
export const schoolDaysSchema = z.array(schoolDaySchema).min(1).max(6);

/** "8h00", "8:00", … → "08:00" (see normalizeTime). */
const timeOfDay = z.string().transform((value, ctx) => {
  const time = normalizeTime(value);
  if (time) return time;
  ctx.addIssue({ code: "custom", message: "invalidTime" });
  return z.NEVER;
});

export const timeSlotSchema = z
  .object({
    startTime: timeOfDay,
    endTime: timeOfDay,
    kind: z.enum(SLOT_KINDS, { error: "generic" }),
    /** "" = no label. */
    label: z.string().trim().max(MAX_LABEL_LENGTH, { error: "tooLong" }),
  })
  .superRefine((v, ctx) => {
    // Same rules as the database: start < end, at most 4 hours.
    const length = toMinutes(v.endTime) - toMinutes(v.startTime);
    if (length <= 0) ctx.addIssue({ code: "custom", path: ["endTime"], message: "slotEndBeforeStart" });
    else if (length > MAX_SLOT_MINUTES) ctx.addIssue({ code: "custom", path: ["endTime"], message: "slotTooLong" });
  });
export type TimeSlotFormValues = z.input<typeof timeSlotSchema>;

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
