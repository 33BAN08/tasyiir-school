import { z } from "zod";

// Teachers + the subjects they teach (Phase 5). Error messages are next-intl keys under `teachers.errors`.

export const MAX_TEACHER_SUBJECTS = 20;

export const teacherIdSchema = z.uuid();

/** The full set of subjects a teacher teaches (replaces the previous set). */
export const teacherSubjectsSchema = z
  .array(z.uuid({ error: "subjectNotFound" }))
  .max(MAX_TEACHER_SUBJECTS, { error: "tooManySubjects" })
  .transform((ids) => [...new Set(ids)]);
