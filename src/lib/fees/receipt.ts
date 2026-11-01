import "server-only";

import { schoolClock } from "@/lib/attendance/clock";
import { getSchoolContact } from "@/lib/school-contact/contact";
import { createClient } from "@/lib/supabase/server";

import type { ChargeKind } from "./ledger";
import type { PaymentMethod } from "./payments";
import { canReusePrint } from "./print-reuse";

// One receipt for the print page (RLS: fees.view + module; another school's
// payment reads as nothing). Staff names through fee_staff_names: the
// accountant cannot read other profiles.

export type ReceiptLine = { kind: ChargeKind; month: string | null; serviceId: string | null; amount: number; partial: boolean };

export type Receipt = {
  id: string;
  label: string;
  amount: number;
  method: PaymentMethod;
  bank: string | null;
  reference: string | null;
  chequeDate: string | null;
  payerName: string | null;
  note: string | null;
  paidOn: string;
  receivedBy: string | null;
  /** `at`: the school's local date + time, from the database (Node's time-zone data is out of date). */
  cancelled: { reason: string; note: string | null; at: { date: string; time: string }; by: string | null } | null;
  student: { id: string; firstName: string; lastName: string; firstNameAr: string | null; lastNameAr: string | null; massarCode: string | null };
  className: string | null;
  yearLabel: string;
  lines: ReceiptLine[];
  serviceNames: Record<string, { name: string; nameAr: string | null }>;
  schoolPhone: string | null;
};

export async function getReceipt(schoolId: string, paymentId: string): Promise<Receipt | null> {
  const supabase = await createClient();
  const { data: p, error } = await supabase
    .from("payments")
    .select(
      "id, academic_year_id, student_id, receipt_label, amount_centimes, method, bank, reference, cheque_date, payer_name, note, paid_on, received_by, cancelled_at, cancelled_by, cancel_reason, cancel_note, year:academic_years(label), student:students(id, first_name, last_name, first_name_ar, last_name_ar, code_massar), payment_allocations(amount_centimes, charge:student_charges(kind, month, service_id, due_on, net_centimes))",
    )
    .eq("school_id", schoolId)
    .eq("id", paymentId)
    .maybeSingle();
  if (error) throw new Error("getReceipt failed");
  if (!p || !p.student) return null;

  const staffIds = [p.received_by, p.cancelled_by].filter((x): x is string => !!x);
  const [enrollment, services, staff, contact, cancelledAt] = await Promise.all([
    supabase
      .from("student_enrollments")
      .select("class:classes(name)")
      .eq("school_id", schoolId)
      .eq("academic_year_id", p.academic_year_id)
      .eq("student_id", p.student_id)
      .maybeSingle(),
    supabase.from("fee_services").select("id, name, name_ar").eq("school_id", schoolId).eq("academic_year_id", p.academic_year_id),
    staffIds.length ? supabase.rpc("fee_staff_names", { p_ids: staffIds }) : Promise.resolve({ data: [], error: null }),
    getSchoolContact(schoolId),
    p.cancelled_at ? schoolClock(p.cancelled_at) : null,
  ]);
  if (enrollment.error || services.error || staff.error) throw new Error("getReceipt failed");
  const names = new Map((staff.data ?? []).map((s) => [s.id, s.full_name]));

  const lines = p.payment_allocations
    .flatMap((a) => (a.charge ? [{ a, c: a.charge }] : []))
    .sort((x, y) => (x.c.due_on < y.c.due_on ? -1 : x.c.due_on > y.c.due_on ? 1 : 0) || x.c.kind.localeCompare(y.c.kind))
    .map(({ a, c }) => ({
      kind: c.kind as ChargeKind,
      month: c.month,
      serviceId: c.service_id,
      amount: a.amount_centimes,
      partial: a.amount_centimes < (c.net_centimes ?? 0),
    }));

  return {
    id: p.id,
    label: p.receipt_label,
    amount: p.amount_centimes,
    method: p.method as PaymentMethod,
    bank: p.bank,
    reference: p.reference,
    chequeDate: p.cheque_date,
    payerName: p.payer_name,
    note: p.note,
    paidOn: p.paid_on,
    receivedBy: p.received_by ? names.get(p.received_by) ?? null : null,
    cancelled: p.cancelled_at && cancelledAt
      ? { reason: p.cancel_reason ?? "other", note: p.cancel_note, at: { date: cancelledAt.date, time: cancelledAt.time }, by: p.cancelled_by ? names.get(p.cancelled_by) ?? null : null }
      : null,
    student: {
      id: p.student.id,
      firstName: p.student.first_name,
      lastName: p.student.last_name,
      firstNameAr: p.student.first_name_ar,
      lastNameAr: p.student.last_name_ar,
      massarCode: p.student.code_massar,
    },
    className: enrollment.data?.class?.name ?? null,
    yearLabel: p.year?.label ?? "",
    lines,
    serviceNames: Object.fromEntries(services.data.map((s) => [s.id, { name: s.name, nameAr: s.name_ar }])),
    schoolPhone: contact?.phone ?? null,
  };
}

/**
 * The print this opening shows: the one the language switch came from when it
 * may be re-used (nothing recorded), else a new one (record_receipt_print).
 */
export async function openReceiptPrint(
  paymentId: string,
  userId: string,
  language: "fr" | "ar",
  fromPrint: string | null,
): Promise<{ id: string; printNo: number }> {
  const supabase = await createClient();
  if (fromPrint) {
    const { data } = await supabase
      .from("receipt_prints")
      .select("id, payment_id, printed_by, printed_at, print_no")
      .eq("id", fromPrint)
      .maybeSingle();
    if (data) {
      const row = { id: data.id, paymentId: data.payment_id, printedBy: data.printed_by, printedAt: data.printed_at, printNo: data.print_no };
      if (canReusePrint(row, { paymentId, userId, nowMs: Date.now() })) return { id: row.id, printNo: row.printNo };
    }
  }
  const { data, error } = await supabase.rpc("record_receipt_print", { p_payment: paymentId, p_language: language }).single();
  if (error || !data) throw new Error("record_receipt_print failed");
  return { id: data.print_id, printNo: data.print_no };
}
