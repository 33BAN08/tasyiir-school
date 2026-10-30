import { z } from "zod";

import { MAX_CENTIMES, parseAmount, parsePercent } from "@/lib/fees/money";

// Fees forms (Phase 13 step 2). Amounts are typed as text and leave here as
// integer centimes. Error messages are next-intl keys under `fees.errors`.

export const feeIdSchema = z.uuid({ error: "notFound" });

/** First day of a month, `yyyy-MM-01`. */
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/, { error: "monthInvalid" });

/** Typed amount → centimes; `required` false lets an empty box through as null. */
const amount = (required: boolean) =>
  z
    .string({ error: "amountInvalid" })
    .transform((text, ctx) => {
      const value = parseAmount(text);
      if (value === null) {
        if (required) ctx.addIssue({ code: "custom", message: "amountRequired" });
        return null;
      }
      if (Number.isNaN(value) || value > MAX_CENTIMES) {
        ctx.addIssue({ code: "custom", message: "amountInvalid" });
        return z.NEVER;
      }
      return value;
    });

export const feeMonthsSchema = z.object({
  months: z.array(monthSchema).min(1, { error: "monthsRequired" }).max(12, { error: "monthsRequired" }),
  dueDay: z.coerce.number<string | number>({ error: "dueDayRange" }).int({ error: "dueDayRange" })
    .min(1, { error: "dueDayRange" }).max(28, { error: "dueDayRange" }),
});
export type FeeMonthsValues = z.input<typeof feeMonthsSchema>;

/** One level of the plans grid: both boxes empty = no fee for the level (the row is removed). */
export const feePlanRowSchema = z.object({
  levelId: feeIdSchema,
  registration: amount(false),
  monthly: amount(false),
});
export const feePlanRowsSchema = z.array(feePlanRowSchema).max(100, { error: "generic" });
export type FeePlanRowValues = z.input<typeof feePlanRowSchema>;

export const feeServiceSchema = z.object({
  name: z.string().trim().min(1, { error: "nameRequired" }).max(80, { error: "tooLong" }),
  nameAr: z.string().trim().max(80, { error: "tooLong" }).transform((v) => v || null),
  monthly: amount(true),
  active: z.boolean(),
});
export type FeeServiceValues = z.input<typeof feeServiceSchema>;

export const studentServiceSchema = z
  .object({
    serviceId: feeIdSchema,
    fromMonth: monthSchema,
    /** Empty = until the end of the year. */
    toMonth: z.union([monthSchema, z.literal("")]).transform((v) => v || null),
  })
  .superRefine((v, ctx) => {
    if (v.toMonth && v.toMonth < v.fromMonth) ctx.addIssue({ code: "custom", path: ["toMonth"], message: "toBeforeFrom" });
  });
export type StudentServiceValues = z.input<typeof studentServiceSchema>;

export const DISCOUNT_KINDS = ["sibling", "scholarship", "fixed"] as const;
export const DISCOUNT_TARGETS = ["tuition", "registration", "services", "all"] as const;
export type DiscountKind = (typeof DISCOUNT_KINDS)[number];
export type DiscountTarget = (typeof DISCOUNT_TARGETS)[number];

/** `mode` percent → `value` is a percent (basis points out); amount → centimes per charge. Kind fixed = amount. */
export const discountSchema = z
  .object({
    kind: z.enum(DISCOUNT_KINDS, { error: "generic" }),
    mode: z.enum(["percent", "amount"], { error: "generic" }),
    value: z.string({ error: "valueInvalid" }),
    appliesTo: z.enum(DISCOUNT_TARGETS, { error: "generic" }),
    reason: z.string().trim().max(200, { error: "tooLong" }).transform((v) => v || null),
  })
  .transform((v, ctx) => {
    const mode = v.kind === "fixed" ? "amount" : v.mode;
    if (mode === "percent") {
      const bp = parsePercent(v.value);
      if (bp === null || Number.isNaN(bp) || bp < 1 || bp > 10_000) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "percentRange" });
        return z.NEVER;
      }
      return { kind: v.kind, percentBp: bp, amountCentimes: null, appliesTo: v.appliesTo, reason: v.reason };
    }
    const centimes = parseAmount(v.value);
    if (centimes === null || Number.isNaN(centimes) || centimes < 1 || centimes > MAX_CENTIMES) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "amountInvalid" });
      return z.NEVER;
    }
    return { kind: v.kind, percentBp: null, amountCentimes: centimes, appliesTo: v.appliesTo, reason: v.reason };
  });
export type DiscountValues = z.input<typeof discountSchema>;
