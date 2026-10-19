import { z } from "zod";

import { normalizeMobile } from "@/lib/parents/phone";

// "Demander une démo" form on the public home page. Same limits as the
// demo_requests CHECKs. Error messages are `landing.demo.errors` keys.

export const DEMO_STUDENT_RANGES = ["lt200", "200_500", "500_1000", "gt1000"] as const;
export type DemoStudentRange = (typeof DEMO_STUDENT_RANGES)[number];

function text(min: number, max: number, error: string) {
  return z
    .string({ error })
    .transform((v) => v.trim().replace(/\s+/g, " "))
    .pipe(z.string().min(min, { error }).max(max, { error: "tooLong" }));
}

export const demoRequestSchema = z.object({
  fullName: text(2, 100, "fullName"),
  schoolName: text(2, 150, "schoolName"),
  city: text(2, 80, "city"),
  /** Typed "06 12 34 56 78" (or +212…), stored "+212612345678". */
  phone: z
    .string({ error: "phone" })
    .refine((v) => normalizeMobile(v) !== null, { error: "phone" }),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, { error: "email" })
    .refine((v) => v === "" || z.email().safeParse(v).success, { error: "email" }),
  /** "" until a range is picked in the select. */
  students: z
    .string({ error: "students" })
    .refine((v): v is DemoStudentRange => (DEMO_STUDENT_RANGES as readonly string[]).includes(v), {
      error: "students",
    }),
  message: z.string().trim().max(1000, { error: "message" }),
  /** Honeypot: hidden from people, filled by bots. */
  website: z.string().max(500),
});

export type DemoRequestInput = z.input<typeof demoRequestSchema>;
