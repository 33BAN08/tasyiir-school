import { z } from "zod";

// Lessons (Phase 6). Error messages are `timetable.errors` keys.

/** What the lesson dialog edits: subject, teacher, optional room ("" = none). */
export const lessonDetailsSchema = z.object({
  subjectId: z.uuid({ error: "subjectRequired" }),
  teacherId: z.uuid({ error: "teacherRequired" }),
  roomId: z.union([z.literal(""), z.uuid()], { error: "roomNotFound" }),
});
export type LessonDetailsValues = z.infer<typeof lessonDetailsSchema>;

/** A new lesson: the cell (class + time slot) and its details. */
export const newLessonSchema = lessonDetailsSchema.extend({
  classId: z.uuid({ error: "notFound" }),
  timeSlotId: z.uuid({ error: "notFound" }),
});
export type NewLessonValues = z.infer<typeof newLessonSchema>;

export const lessonIdSchema = z.uuid();
