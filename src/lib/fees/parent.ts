import "server-only";

import { getSchoolContact } from "@/lib/school-contact/contact";
import { createClient } from "@/lib/supabase/server";

import { type ChargeCore, type ChargeKind, ledgerTotals } from "./ledger";
import type { PaymentMethod } from "./payments";
import type { Receipt } from "./receipt";

// What a parent reads about fees (Phase 13 step 8), only through my_children_fees
// and my_receipt: they check the school, the fees module and the guardian link,
// and return a fixed list of fields. No staff note, staff name, cancel reason,
// payer, bank, cheque number, gross price or discount kind can reach the page.
// One row per child + year: never near the Data API's 1000 rows.

export type ParentCharge = ChargeCore & {
  serviceId: null;
  serviceName: string | null;
  serviceNameAr: string | null;
  discount: number;
  cancelled: boolean;
};

export type ParentReceiptRow = {
  id: string;
  label: string;
  amount: number;
  method: PaymentMethod;
  paidOn: string;
  cancelled: boolean;
  cancelledOn: string | null;
};

export type ChildFeeYear = {
  studentId: string;
  yearId: string;
  yearLabel: string;
  isCurrent: boolean;
  /** `yyyy-MM-dd`, from the database. */
  today: string;
  charges: ParentCharge[];
  receipts: ParentReceiptRow[];
};

type RawCharge = {
  id: string; kind: ChargeKind; month: string | null; service_name: string | null; service_name_ar: string | null;
  due_on: string; net: number; discount: number; paid: number; cancelled: boolean;
};
type RawReceipt = { id: string; label: string; amount: number; method: PaymentMethod; paid_on: string; cancelled: boolean; cancelled_on: string | null };
type RawLine = { kind: ChargeKind; month: string | null; service_name: string | null; service_name_ar: string | null; amount: number; partial: boolean };

/** Every child + year with fee data, newest year first per child. */
export async function listMyChildrenFees(): Promise<ChildFeeYear[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_children_fees");
  if (error) throw new Error("listMyChildrenFees failed");
  return data.map((row) => ({
    studentId: row.student_id,
    yearId: row.academic_year_id,
    yearLabel: row.year_label,
    isCurrent: row.is_current,
    today: row.today,
    charges: (row.charges as unknown as RawCharge[]).map((c) => ({
      id: c.id,
      kind: c.kind,
      month: c.month,
      serviceId: null,
      serviceName: c.service_name,
      serviceNameAr: c.service_name_ar,
      dueOn: c.due_on,
      net: c.net,
      discount: c.discount,
      paid: c.paid,
      cancelled: c.cancelled,
    })),
    receipts: (row.receipts as unknown as RawReceipt[]).map((r) => ({
      id: r.id,
      label: r.label,
      amount: r.amount,
      method: r.method,
      paidOn: r.paid_on,
      cancelled: r.cancelled,
      cancelledOn: r.cancelled_on,
    })),
  }));
}

/** The year to show: the one asked for, else the current one, else the child's newest. */
export function pickFeeYear(rows: ChildFeeYear[], year: unknown): ChildFeeYear | undefined {
  return rows.find((r) => r.yearId === year) ?? rows.find((r) => r.isCurrent) ?? rows[0];
}

/** The home tile: null without fee data; else whether any year has something due today (arrears included). */
export function childHasFeesDue(rows: ChildFeeYear[], childId: string): boolean | null {
  const mine = rows.filter((r) => r.studentId === childId);
  if (mine.length === 0) return null;
  return mine.some((r) => ledgerTotals(r.charges, r.today).dueNow > 0);
}

/** One valid receipt of the caller's child, shaped for ReceiptSheet (null: not theirs, cancelled or unknown). */
export async function getMyReceipt(schoolId: string, paymentId: string): Promise<Receipt | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_receipt", { p_payment: paymentId }).maybeSingle();
  if (error) throw new Error("getMyReceipt failed");
  if (!data) return null;
  const contact = await getSchoolContact(schoolId);
  const lines = data.lines as unknown as RawLine[];

  return {
    id: data.payment_id,
    label: data.receipt_label,
    amount: data.amount_centimes,
    method: data.method as PaymentMethod,
    paidOn: data.paid_on,
    bank: null,
    reference: null,
    chequeDate: null,
    payerName: null,
    note: null,
    receivedBy: null,
    cancelled: null,
    student: {
      id: data.student_id,
      firstName: data.first_name,
      lastName: data.last_name,
      firstNameAr: data.first_name_ar,
      lastNameAr: data.last_name_ar,
      massarCode: data.code_massar,
    },
    className: data.class_name,
    yearLabel: data.year_label,
    // my_receipt copies the service names into its lines: each line is its own key here.
    lines: lines.map((l, i) => ({ kind: l.kind, month: l.month, serviceId: l.service_name ? String(i) : null, amount: l.amount, partial: l.partial })),
    serviceNames: Object.fromEntries(
      lines.flatMap((l, i) => (l.service_name ? [[String(i), { name: l.service_name, nameAr: l.service_name_ar }]] : [])),
    ),
    schoolPhone: contact?.phone ?? null,
  };
}
