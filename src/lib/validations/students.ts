import { z } from "zod";

import { MASSAR_PATTERN, normalizeMassar } from "@/lib/students/massar";

import { firstParam, pageParam, searchParam } from "./list-params";

// Students (Phase 5). Error messages are next-intl keys under `students.errors`.

export const STUDENT_PAGE_SIZE = 25;
export const GENDERS = ["male", "female"] as const;
export type Gender = (typeof GENDERS)[number];

/** Class filter value for "no class this year". */
export const NO_CLASS = "none";

export const studentListParamsSchema = z.object({
  q: searchParam,
  class: firstParam.transform((v) => (v === NO_CLASS || z.uuid().safeParse(v).success ? v : undefined)),
  page: pageParam,
});
export type StudentListParams = z.infer<typeof studentListParamsSchema>;

export const studentIdSchema = z.uuid();

const ARABIC_LETTER = /[؀-ۿ]/;
const LATIN_LETTER = /[A-Za-z]/;

const latinName = z
  .string()
  .trim()
  .min(1, { error: "nameRequired" })
  .max(60, { error: "tooLong" })
  .refine((v) => !ARABIC_LETTER.test(v), { error: "latinOnly" });

/** "" = not given. */
const arabicName = z
  .string()
  .trim()
  .max(60, { error: "tooLong" })
  .refine((v) => !LATIN_LETTER.test(v), { error: "arabicOnly" });

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "invalidDate" });

export const studentSchema = z
  .object({
    lastName: latinName,
    firstName: latinName,
    lastNameAr: arabicName,
    firstNameAr: arabicName,
    birthDate: isoDate,
    gender: z.enum(GENDERS, { error: "genderRequired" }),
    /** Trimmed and uppercased before the check; "" = none. */
    codeMassar: z
      .string()
      .transform(normalizeMassar)
      .refine((v) => v === "" || MASSAR_PATTERN.test(v), { error: "invalidMassar" }),
    /** Class for the current year; "" = none. */
    classId: z.union([z.literal(""), z.uuid()], { error: "invalidClass" }),
  })
  .superRefine((v, ctx) => {
    // Arabic names: both or neither (database check students_names_ar_check).
    if (Boolean(v.lastNameAr) !== Boolean(v.firstNameAr)) {
      ctx.addIssue({ code: "custom", path: [v.lastNameAr ? "firstNameAr" : "lastNameAr"], message: "arabicNamesBoth" });
    }
    // After 1980 (database check) and not in the future. ISO dates compare as strings.
    if (v.birthDate <= "1980-01-01" || v.birthDate > new Date().toISOString().slice(0, 10)) {
      ctx.addIssue({ code: "custom", path: ["birthDate"], message: "birthDateRange" });
    }
  });
export type StudentFormValues = z.input<typeof studentSchema>;
export type StudentInput = z.output<typeof studentSchema>;
