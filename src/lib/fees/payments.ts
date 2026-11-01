import "server-only";

import { schoolClock } from "@/lib/attendance/clock";
import { createClient } from "@/lib/supabase/server";

import type { ChargeKind, LedgerCharge } from "./ledger";

// A student's charges and payments for a year (RLS: fees.view + module).
// One student's year holds a few dozen charges and payments: no paging.

export type PaymentMethod = "cash" | "cheque" | "transfer";

export type LedgerPayment = {
  id: string;
  receiptLabel: string;
  amount: number;
  method: PaymentMethod;
  bank: string | null;
  reference: string | null;
  chequeDate: string | null;
  payerName: string | null;
  note: string | null;
  paidOn: string;
  receivedBy: string | null;
  allocations: { chargeId: string; amount: number }[];
  cancelled: { reason: string; note: string | null; at: string; by: string | null } | null;
};

export type StudentLedger = { today: string; charges: LedgerCharge[]; payments: LedgerPayment[] };

export async function getStudentLedger(schoolId: string, yearId: string, studentId: string): Promise<StudentLedger> {
  const supabase = await createClient();
  const [charges, payments, clock] = await Promise.all([
    supabase
      .from("student_charges")
      .select("id, kind, month, service_id, due_on, gross_centimes, net_centimes, cancelled_at, cancel_reason, cancel_note")
      .eq("school_id", schoolId)
      .eq("academic_year_id", yearId)
      .eq("student_id", studentId),
    supabase
      .from("payments")
      .select(
        "id, receipt_label, receipt_no, amount_centimes, method, bank, reference, cheque_date, payer_name, note, paid_on, received_by, cancelled_by, cancelled_at, cancel_reason, cancel_note, payment_allocations(charge_id, amount_centimes)",
      )
      .eq("school_id", schoolId)
      .eq("academic_year_id", yearId)
      .eq("student_id", studentId)
      .order("receipt_no", { ascending: false }),
    schoolClock(),
  ]);
  if (charges.error || payments.error) throw new Error("getStudentLedger failed");
  // Staff names through fee_staff_names: the accountant cannot read other profiles.
  const staffIds = [...new Set(payments.data.flatMap((p) => [p.received_by, p.cancelled_by]).filter((x): x is string => !!x))];
  const staff = staffIds.length ? await supabase.rpc("fee_staff_names", { p_ids: staffIds }) : { data: [], error: null };
  if (staff.error) throw new Error("getStudentLedger failed");
  const names = new Map((staff.data ?? []).map((s) => [s.id, s.full_name]));

  const paid = new Map<string, number>();
  for (const p of payments.data) {
    if (p.cancelled_at) continue;
    for (const a of p.payment_allocations) paid.set(a.charge_id, (paid.get(a.charge_id) ?? 0) + a.amount_centimes);
  }

  return {
    today: clock.date,
    charges: charges.data.map((c) => ({
      id: c.id,
      kind: c.kind as ChargeKind,
      month: c.month,
      serviceId: c.service_id,
      dueOn: c.due_on,
      gross: c.gross_centimes,
      net: c.net_centimes ?? 0,
      paid: paid.get(c.id) ?? 0,
      cancelled: c.cancelled_at ? { reason: c.cancel_reason ?? "other", note: c.cancel_note, at: c.cancelled_at } : null,
    })),
    payments: payments.data.map((p) => ({
      id: p.id,
      receiptLabel: p.receipt_label,
      amount: p.amount_centimes,
      method: p.method as PaymentMethod,
      bank: p.bank,
      reference: p.reference,
      chequeDate: p.cheque_date,
      payerName: p.payer_name,
      note: p.note,
      paidOn: p.paid_on,
      receivedBy: p.received_by ? names.get(p.received_by) ?? null : null,
      allocations: p.payment_allocations.map((a) => ({ chargeId: a.charge_id, amount: a.amount_centimes })),
      cancelled: p.cancelled_at
        ? { reason: p.cancel_reason ?? "other", note: p.cancel_note, at: p.cancelled_at, by: p.cancelled_by ? names.get(p.cancelled_by) ?? null : null }
        : null,
    })),
  };
}
