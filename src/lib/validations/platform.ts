import { z } from "zod";

import { emailField, localeField, optionalPhoneField, personNameField } from "@/lib/validations/fields";
import { enumParam, pageParam, searchParam } from "@/lib/validations/list-params";

export const SCHOOL_STATUSES = ["active", "suspended"] as const;
export type SchoolStatus = (typeof SCHOOL_STATUSES)[number];

export const SUBSCRIPTION_STATUSES = ["trial", "active", "suspended", "expired"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SCHOOLS_PAGE_SIZE = 20;

/** URL query of the schools list. Invalid values fall back to defaults, never error. */
export const schoolListParamsSchema = z.object({
  q: searchParam,
  status: enumParam(SCHOOL_STATUSES),
  page: pageParam,
});

export type SchoolListParams = z.infer<typeof schoolListParamsSchema>;

// ---------------------------------------------------------------------------
// Platform forms (new-school wizard, school detail). Error messages are
// next-intl keys under `platform.errors`. Shared by forms and Server Actions.
// ---------------------------------------------------------------------------

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: "tooLong" })
    .transform((v) => v || null);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "invalidDate" });

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Editable school identity (the slug is chosen once, at creation). */
const schoolInfoFields = {
  name: z.string().trim().min(2, { error: "nameRequired" }).max(120, { error: "tooLong" }),
  city: optionalText(80),
  phone: optionalPhoneField,
  address: optionalText(200),
};

const subscriptionFields = {
  planId: z.uuid({ error: "planRequired" }),
  startDate: isoDate,
  trialEndsOn: isoDate.or(z.literal("")),
  endDate: isoDate.or(z.literal("")),
};

type SubscriptionDates = { subscriptionStatus: string; startDate: string; trialEndsOn: string; endDate: string };

function checkSubscriptionDates(v: SubscriptionDates, ctx: z.RefinementCtx) {
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
}

/** Empty = no limit / no exception. */
const optionalCount = z
  .string()
  .trim()
  .regex(/^(d{1,6})?$/, { error: "maxStudentsInvalid" })
  .refine((v) => v === "" || Number(v) > 0, { error: "maxStudentsInvalid" })
  .transform((v) => (v === "" ? null : Number(v)));

export const newSchoolSchema = z
  .object({
    // Step 1 — school
    ...schoolInfoFields,
    slug: z
      .string()
      .trim()
      .min(3, { error: "slugInvalid" })
      .max(60, { error: "slugInvalid" })
      .regex(SLUG_PATTERN, { error: "slugInvalid" }),
    // Step 2 — director
    directorName: personNameField,
    directorEmail: emailField,
    directorLocale: localeField,
    // Same rules as changePasswordSchema (bcrypt ignores bytes after 72).
    directorPassword: z
      .string()
      .min(8, { error: "passwordTooShort" })
      .max(72, { error: "passwordTooShort" })
      .regex(/\p{L}/u, { error: "passwordWeak" })
      .regex(/\p{N}/u, { error: "passwordWeak" }),
    // Step 3 — plan & subscription (a new school starts on trial or paid)
    ...subscriptionFields,
    subscriptionStatus: z.enum(["trial", "active"]),
  })
  .superRefine(checkSubscriptionDates);

export type NewSchoolFormValues = z.input<typeof newSchoolSchema>;
export type NewSchoolInput = z.output<typeof newSchoolSchema>;

// School detail page ----------------------------------------------------------

export const schoolIdSchema = z.uuid();

export const schoolInfoSchema = z.object(schoolInfoFields);
export type SchoolInfoFormValues = z.input<typeof schoolInfoSchema>;
export type SchoolInfoInput = z.output<typeof schoolInfoSchema>;

/** Access is cut with the school's own suspend switch, not with a subscription status. */
export const EDITABLE_SUBSCRIPTION_STATUSES = ["trial", "active", "expired"] as const;

export const subscriptionSchema = z
  .object({
    ...subscriptionFields,
    subscriptionStatus: z.enum(EDITABLE_SUBSCRIPTION_STATUSES),
    /** Per-school exceptions to the plan's limits (empty = follow the plan). */
    maxStudentsOverride: optionalCount,
    maxAdminsOverride: optionalCount,
  })
  .superRefine(checkSubscriptionDates);
export type SubscriptionFormValues = z.input<typeof subscriptionSchema>;
export type SubscriptionInput = z.output<typeof subscriptionSchema>;

/** Per-school module switch: follow the plan, or force on / off. */
export const MODULE_OVERRIDES = ["plan", "on", "off"] as const;
export type ModuleOverride = (typeof MODULE_OVERRIDES)[number];

export const moduleOverrideSchema = z.object({
  moduleKey: z.string().regex(/^[a-z_]+$/),
  override: z.enum(MODULE_OVERRIDES),
});

export const schoolStatusSchema = z.enum(SCHOOL_STATUSES);

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

// Plans page -------------------------------------------------------------------

/** "1250", "1250.5" or "1250,50" (DH) → 1250.5. */
const amount = z
  .string()
  .trim()
  .regex(/^\d{1,7}([.,]\d{1,2})?$/, { error: "priceInvalid" })
  .transform((v) => Number(v.replace(",", ".")));

export const planSchema = z.object({
  name: z.string().trim().min(2, { error: "nameRequired" }).max(60, { error: "tooLong" }),
  priceMonthly: amount,
  priceYearly: amount,
  /** Empty = no limit. */
  maxStudents: z
    .string()
    .trim()
    .regex(/^(\d{1,6})?$/, { error: "maxStudentsInvalid" })
    .refine((v) => v === "" || Number(v) > 0, { error: "maxStudentsInvalid" })
    .transform((v) => (v === "" ? null : Number(v))),
  maxAdminAccounts: optionalCount,
  isActive: z.boolean(),
  modules: z.array(z.string().regex(/^[a-z_]+$/)).min(1, { error: "modulesRequired" }),
});
export type PlanFormValues = z.input<typeof planSchema>;
export type PlanInput = z.output<typeof planSchema>;

export const planIdSchema = z.uuid();
