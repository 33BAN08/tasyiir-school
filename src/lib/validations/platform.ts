import { z } from "zod";

export const SCHOOL_STATUSES = ["active", "suspended"] as const;
export type SchoolStatus = (typeof SCHOOL_STATUSES)[number];

export const SUBSCRIPTION_STATUSES = ["trial", "active", "suspended", "expired"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SCHOOLS_PAGE_SIZE = 20;

/** First value of a query param (`?a=1&a=2` → "1"). */
const firstParam = z.preprocess((v) => (Array.isArray(v) ? v[0] : v), z.string().optional());

/** URL query of the schools list. Invalid values fall back to defaults, never error. */
export const schoolListParamsSchema = z.object({
  q: firstParam.transform((v) => v?.trim().slice(0, 100) ?? ""),
  status: firstParam.transform((v) =>
    SCHOOL_STATUSES.includes(v as SchoolStatus) ? (v as SchoolStatus) : undefined,
  ),
  page: firstParam.transform((v) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
  }),
});

export type SchoolListParams = z.infer<typeof schoolListParamsSchema>;

// ---------------------------------------------------------------------------
// New-school wizard. Error messages are next-intl keys under
// `platform.wizard.errors`. Shared by the form (per step) and the Server Action.
// ---------------------------------------------------------------------------

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: "tooLong" })
    .transform((v) => v || null);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "invalidDate" });

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const newSchoolSchema = z
  .object({
    // Step 1 — school
    name: z.string().trim().min(2, { error: "nameRequired" }).max(120, { error: "tooLong" }),
    slug: z
      .string()
      .trim()
      .min(3, { error: "slugInvalid" })
      .max(60, { error: "slugInvalid" })
      .regex(SLUG_PATTERN, { error: "slugInvalid" }),
    city: optionalText(80),
    phone: z
      .string()
      .trim()
      .regex(/^(\+?[0-9][0-9 .-]{5,18})?$/, { error: "phoneInvalid" })
      .transform((v) => v || null),
    address: optionalText(200),
    // Step 2 — director
    directorName: z.string().trim().min(2, { error: "nameRequired" }).max(120, { error: "tooLong" }),
    directorEmail: z.string().trim().toLowerCase().pipe(z.email({ error: "invalidEmail" })),
    directorLocale: z.enum(["ar", "fr", "en"]),
    // Same rules as changePasswordSchema (bcrypt ignores bytes after 72).
    directorPassword: z
      .string()
      .min(8, { error: "passwordTooShort" })
      .max(72, { error: "passwordTooShort" })
      .regex(/\p{L}/u, { error: "passwordWeak" })
      .regex(/\p{N}/u, { error: "passwordWeak" }),
    // Step 3 — plan & subscription
    planId: z.uuid({ error: "planRequired" }),
    subscriptionStatus: z.enum(["trial", "active"]),
    startDate: isoDate,
    trialEndsOn: isoDate.or(z.literal("")),
    endDate: isoDate.or(z.literal("")),
  })
  .superRefine((v, ctx) => {
    if (v.subscriptionStatus === "trial" && !v.trialEndsOn) {
      ctx.addIssue({ code: "custom", path: ["trialEndsOn"], message: "trialEndRequired" });
    }
    // ISO dates compare correctly as strings.
    if (v.subscriptionStatus === "trial" && v.trialEndsOn && v.trialEndsOn < v.startDate) {
      ctx.addIssue({ code: "custom", path: ["trialEndsOn"], message: "dateBeforeStart" });
    }
    if (v.endDate && v.endDate < v.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "dateBeforeStart" });
    }
  });

export type NewSchoolFormValues = z.input<typeof newSchoolSchema>;
export type NewSchoolInput = z.output<typeof newSchoolSchema>;

/** Fields validated before leaving each wizard step. */
export const WIZARD_STEPS = [
  { key: "school", fields: ["name", "slug", "city", "phone", "address"] },
  { key: "director", fields: ["directorName", "directorEmail", "directorLocale", "directorPassword"] },
  { key: "plan", fields: ["planId", "subscriptionStatus", "startDate", "trialEndsOn", "endDate"] },
] as const satisfies readonly { key: string; fields: readonly (keyof NewSchoolFormValues)[] }[];

/** "École Al Amal — Casa" → "ecole-al-amal-casa". */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // strip accents: é → e
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}
