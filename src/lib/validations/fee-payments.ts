import { z } from "zod";

import { parseAmount } from "@/lib/fees/money";

// Payments and cancellations (Phase 13 step 5). The database checks the same
// rules again (record_payment, cancel_payment, cancel_charge). Error messages
// are next-intl keys under `fees.errors`.

/** One payment's upper bound (1 000 000 DH), as payments_amount_check. */
export const MAX_PAYMENT_CENTIMES = 100_000_000;

export const PAYMENT_METHODS = ["cash", "cheque", "transfer"] as const;
export const PAYMENT_CANCEL_REASONS = ["bounced_cheque", "entry_error", "refund", "other"] as const;
export const CHARGE_CANCEL_REASONS = ["left_school", "waived", "entry_error", "other"] as const;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "dateInvalid" });
const optionalText = (max: number) =>
  z.string().trim().max(max, { error: "tooLong" }).transform((v) => v || null);

export const paymentSchema = z
  .object({
    /** Typed amount; ignored when `allocations` is given (the amount is their sum). */
    amount: z.string({ error: "amountInvalid" }),
    method: z.enum(PAYMENT_METHODS, { error: "methodInvalid" }),
    paidOn: date,
    bank: optionalText(60),
    reference: optionalText(60),
    chequeDate: z.union([date, z.literal("")]).transform((v) => v || null),
    payerName: optionalText(100),
    note: optionalText(200),
    /** The staff's own choice of charges; null = oldest due first. */
    allocations: z
      .array(z.object({ chargeId: z.uuid({ error: "allocationInvalid" }), amount: z.number().int().min(1).max(MAX_PAYMENT_CENTIMES) }), {
        error: "allocationInvalid",
      })
      .min(1, { error: "allocationRequired" })
      .max(100, { error: "allocationInvalid" })
      .nullable(),
  })
  .transform((v, ctx) => {
    const amount = v.allocations ? v.allocations.reduce((s, a) => s + a.amount, 0) : parseAmount(v.amount);
    if (amount === null) {
      ctx.addIssue({ code: "custom", path: ["amount"], message: "amountRequired" });
      return z.NEVER;
    }
    if (Number.isNaN(amount) || amount < 1 || amount > MAX_PAYMENT_CENTIMES) {
      ctx.addIssue({ code: "custom", path: [v.allocations ? "allocations" : "amount"], message: "amountInvalid" });
      return z.NEVER;
    }
    if (v.method === "cheque" && !v.bank) {
      ctx.addIssue({ code: "custom", path: ["bank"], message: "bankRequired" });
      return z.NEVER;
    }
    if (v.method === "cheque" && !v.reference) {
      ctx.addIssue({ code: "custom", path: ["reference"], message: "chequeNumberRequired" });
      return z.NEVER;
    }
    const cash = v.method === "cash";
    return {
      ...v,
      amount,
      bank: cash ? null : v.bank,
      reference: cash ? null : v.reference,
      chequeDate: v.method === "cheque" ? v.chequeDate : null,
    };
  });
export type PaymentValues = z.input<typeof paymentSchema>;

const cancelSchema = <R extends readonly [string, ...string[]]>(reasons: R) =>
  z
    .object({
      reason: z.enum(reasons, { error: "cancelReasonInvalid" }),
      note: optionalText(200),
    })
    .superRefine((v, ctx) => {
      if (v.reason === "other" && !v.note) ctx.addIssue({ code: "custom", path: ["note"], message: "cancelNoteRequired" });
    });

export const cancelPaymentSchema = cancelSchema(PAYMENT_CANCEL_REASONS);
export const cancelChargeSchema = cancelSchema(CHARGE_CANCEL_REASONS);
export type CancelValues = { reason: string; note: string };
