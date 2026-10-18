import { z } from "zod";

// Attendance (Phase 7). Error messages are `attendance.errors` keys.

/** The absent / late students of a roll call (everyone else is present). */
export const rollCallMarksSchema = z
  .array(
    z.object({
      studentId: z.uuid({ error: "invalid" }),
      status: z.enum(["absent", "late"], { error: "invalid" }),
      // Late: optional minutes (1–240). Absent: none.
      minutesLate: z.number().int().min(1, { error: "minutes" }).max(240, { error: "minutes" }).nullable(),
    }),
  )
  .max(300, { error: "invalid" })
  .refine((marks) => new Set(marks.map((m) => m.studentId)).size === marks.length, { error: "invalid" })
  .refine((marks) => marks.every((m) => m.status === "late" || m.minutesLate === null), { error: "invalid" });
export type RollCallMarkValues = z.infer<typeof rollCallMarksSchema>;
