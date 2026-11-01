"use server";

import { z } from "zod";

import { parseInput, type StructureActionResult } from "@/lib/structure/action-utils";
import { createClient } from "@/lib/supabase/server";
import { feeIdSchema } from "@/lib/validations/fees";
import { cancelChargeSchema, cancelPaymentSchema, paymentSchema } from "@/lib/validations/fee-payments";

import { feesErrorKey, getFeesActor } from "./actor";

// Payments from the student page's Frais card (Phase 13 step 5): record
// (fees.manage), cancel a payment or a charge (fees.cancel). The database
// functions check everything again and write the audit rows themselves
// (fee_payment.record / .cancel, fee_charge.cancel): nothing logged here.
// Error keys: `fees.errors`.

type PaymentField = "amount" | "paidOn" | "bank" | "reference" | "chequeDate" | "payerName" | "note" | "allocations";

const PAYMENT_FIELDS: Record<string, PaymentField> = {
  amountInvalid: "amount",
  amountAboveBalance: "amount",
  paidOnInvalid: "paidOn",
  chequeDetailsRequired: "bank",
  allocationInvalid: "allocations",
};

export type RecordedPayment = { paymentId: string; receiptLabel: string; replayed: boolean };

/**
 * One payment. `idempotencyKey` is made by the dialog when it opens: sending
 * the same key again (a double click, a retry after a lost answer) returns the
 * first payment with `replayed`, never a second one.
 */
export async function recordPayment(
  studentId: unknown,
  yearId: unknown,
  input: unknown,
  idempotencyKey: unknown,
): Promise<StructureActionResult<RecordedPayment, PaymentField>> {
  const actor = await getFeesActor("fees.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const student = feeIdSchema.safeParse(studentId);
  const year = feeIdSchema.safeParse(yearId);
  if (!student.success || !year.success) return { ok: false, error: "notFound" };
  const key = z.uuid().safeParse(idempotencyKey);
  if (!key.success) return { ok: false, error: "idempotencyConflict" };
  const v = parseInput<typeof paymentSchema, PaymentField>(paymentSchema, input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const { data, error } = await (await createClient())
    .rpc("record_payment", {
      p_student: student.data,
      p_year: year.data,
      p_amount: v.values.amount,
      p_method: v.values.method,
      p_paid_on: v.values.paidOn,
      p_idempotency_key: key.data,
      p_bank: v.values.bank ?? undefined,
      p_reference: v.values.reference ?? undefined,
      p_cheque_date: v.values.chequeDate ?? undefined,
      p_payer_name: v.values.payerName ?? undefined,
      p_note: v.values.note ?? undefined,
      p_allocations: v.values.allocations
        ? v.values.allocations.map((a) => ({ charge_id: a.chargeId, amount_centimes: a.amount }))
        : undefined,
    })
    .single();
  if (error || !data) {
    const k = error ? feesErrorKey(error) : "generic";
    return { ok: false, error: k, field: PAYMENT_FIELDS[k] };
  }
  return { ok: true, data: { paymentId: data.payment_id, receiptLabel: data.receipt_label, replayed: data.replayed } };
}

export async function cancelPayment(paymentId: unknown, input: unknown): Promise<StructureActionResult<null, "reason" | "note">> {
  const actor = await getFeesActor("fees.cancel");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = feeIdSchema.safeParse(paymentId);
  if (!id.success) return { ok: false, error: "notFound" };
  const v = parseInput<typeof cancelPaymentSchema, "reason" | "note">(cancelPaymentSchema, input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const { error } = await (await createClient()).rpc("cancel_payment", {
    p_payment: id.data,
    p_reason: v.values.reason,
    p_note: v.values.note ?? undefined,
  });
  if (error) return cancelFailure(feesErrorKey(error));
  return { ok: true, data: null };
}

/** A charge that has no money on it (left the school, waived, entry error). */
export async function cancelCharge(chargeId: unknown, input: unknown): Promise<StructureActionResult<null, "reason" | "note">> {
  const actor = await getFeesActor("fees.cancel");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = feeIdSchema.safeParse(chargeId);
  if (!id.success) return { ok: false, error: "notFound" };
  const v = parseInput<typeof cancelChargeSchema, "reason" | "note">(cancelChargeSchema, input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const { error } = await (await createClient()).rpc("cancel_charge", {
    p_charge: id.data,
    p_reason: v.values.reason,
    p_note: v.values.note ?? undefined,
  });
  if (error) return cancelFailure(feesErrorKey(error));
  return { ok: true, data: null };
}

function cancelFailure(error: string): StructureActionResult<never, "reason" | "note"> {
  if (error === "cancelNoteRequired" || error === "tooLong") return { ok: false, error, field: "note" };
  if (error === "cancelReasonInvalid") return { ok: false, error, field: "reason" };
  return { ok: false, error };
}
