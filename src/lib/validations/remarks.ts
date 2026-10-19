import { z } from "zod";

// Student remarks (Phase 9). Same limits as the student_remarks CHECKs. Error
// messages are `remarks.errors` keys.

export const REMARK_TYPES = ["behavior", "homework", "material", "praise"] as const;
export type RemarkType = (typeof REMARK_TYPES)[number];

export const REMARK_MAX = 500;

/** The author may change or delete a remark for this long after writing it. */
export const REMARK_EDIT_HOURS = 24;

export const remarkSchema = z.object(
  {
    type: z.enum(REMARK_TYPES, { error: "typeRequired" }),
    body: z
      .string({ error: "bodyRequired" })
      .trim()
      .min(1, { error: "bodyRequired" })
      .max(REMARK_MAX, { error: "bodyTooLong" }),
  },
  { error: "invalid" },
);
export type RemarkFormValues = z.input<typeof remarkSchema>;

export const remarkIdSchema = z.uuid({ error: "notFound" });
