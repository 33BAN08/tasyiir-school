import "server-only";

import { schoolClock } from "@/lib/attendance/clock";
import type { StudentNames } from "@/lib/students/names";
import { compareClassNames } from "@/lib/structure/class-names";
import { readAll } from "@/lib/supabase/read-all";
import { createClient } from "@/lib/supabase/server";

import type { PaymentMethod } from "./payments";
import { dayAdd, journalTotals, type JournalTotals } from "./report-rules";

// The fee reports (Phase 13 step 7), with the caller's session: fee_unpaid /
// fee_summary return nothing without fees.view + the module, and RLS fences
// every table read (guardians: students.view). Lists can pass 1000 rows:
// readAll() on a unique order; reads by id go in chunks (URL length).

type Supabase = Awaited<ReturnType<typeof createClient>>;

const CHUNK = 150;

async function inChunks<T>(ids: string[], read: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await read(ids.slice(i, i + CHUNK));
    if (error) throw new Error("fee report read failed");
    out.push(...(data ?? []));
  }
  return out;
}

const namesOf = (s: { first_name: string; last_name: string; first_name_ar: string | null; last_name_ar: string | null }): StudentNames => ({
  firstName: s.first_name,
  lastName: s.last_name,
  firstNameAr: s.first_name_ar,
  lastNameAr: s.last_name_ar,
});

const byClassThenName = (a: { className: string | null; names: StudentNames }, b: { className: string | null; names: StudentNames }) =>
  compareClassNames(a.className ?? "￿", b.className ?? "￿") ||
  a.names.lastName.localeCompare(b.names.lastName, "fr") ||
  a.names.firstName.localeCompare(b.names.firstName, "fr");

async function studentsById(supabase: Supabase, ids: string[]) {
  const rows = await inChunks(ids, (chunk) =>
    supabase.from("students").select("id, first_name, last_name, first_name_ar, last_name_ar").in("id", chunk),
  );
  return new Map(rows.map((s) => [s.id, namesOf(s)]));
}

// --- Unpaid list ------------------------------------------------------------------------------------------

export type Guardian = { name: string; phone: string; relation: string };

export type UnpaidRow = {
  studentId: string;
  names: StudentNames;
  classId: string | null;
  className: string | null;
  /** Due to date (centimes). */
  due: number;
  /** Whole-year balance, due or not. */
  yearBalance: number;
  oldestDueOn: string;
  /** Unpaid months in due order; month null = registration. */
  months: { month: string | null; balance: number }[];
  guardians: Guardian[];
};

export type UnpaidFilter = { classId: string | null; month: string | null; registration: boolean };

export type UnpaidList = { today: string; rows: UnpaidRow[]; total: number };

const RELATION_ORDER = ["father", "mother", "tutor"];

export async function getUnpaid(schoolId: string, yearId: string, filter: UnpaidFilter, withGuardians: boolean): Promise<UnpaidList> {
  const supabase = await createClient();
  const [unpaid, clock, classes] = await Promise.all([
    readAll(
      (from, to) =>
        supabase
          .rpc("fee_unpaid", {
            p_year: yearId,
            ...(filter.classId ? { p_class: filter.classId } : {}),
            ...(filter.month ? { p_month: filter.month } : {}),
            ...(filter.registration ? { p_registration: true } : {}),
          })
          .order("student_id")
          .range(from, to),
      "fee_unpaid",
    ),
    schoolClock(),
    supabase.from("classes").select("id, name").eq("school_id", schoolId).eq("academic_year_id", yearId),
  ]);
  if (classes.error) throw new Error("getUnpaid failed");
  const className = new Map(classes.data.map((c) => [c.id, c.name]));
  const ids = unpaid.map((u) => u.student_id);
  const [names, links] = await Promise.all([
    studentsById(supabase, ids),
    withGuardians
      ? inChunks(ids, (chunk) =>
          supabase
            .from("student_guardians")
            .select("student_id, relation, guardian:guardians(first_name, last_name, phone)")
            .eq("school_id", schoolId)
            .in("student_id", chunk),
        )
      : Promise.resolve([]),
  ]);
  const guardians = new Map<string, Guardian[]>();
  for (const l of links) {
    if (!l.guardian) continue;
    const list = guardians.get(l.student_id) ?? [];
    list.push({ name: `${l.guardian.last_name} ${l.guardian.first_name}`, phone: l.guardian.phone, relation: l.relation });
    guardians.set(l.student_id, list);
  }
  for (const list of guardians.values()) list.sort((a, b) => RELATION_ORDER.indexOf(a.relation) - RELATION_ORDER.indexOf(b.relation));

  const rows: UnpaidRow[] = unpaid
    .filter((u) => names.has(u.student_id))
    .map((u) => ({
      studentId: u.student_id,
      names: names.get(u.student_id)!,
      classId: u.class_id,
      className: u.class_id ? (className.get(u.class_id) ?? null) : null,
      due: u.due_centimes,
      yearBalance: u.year_balance_centimes,
      oldestDueOn: u.oldest_due_on,
      months: (u.unpaid as { month: string | null; balance: number }[]).map((m) => ({ month: m.month, balance: Number(m.balance) })),
      guardians: guardians.get(u.student_id) ?? [],
    }))
    .sort(byClassThenName);
  return { today: clock.date, rows, total: rows.reduce((n, r) => n + r.due, 0) };
}

// --- Journal ----------------------------------------------------------------------------------------------

export type JournalPayment = {
  id: string;
  receiptLabel: string;
  paidOn: string;
  amount: number;
  method: PaymentMethod;
  bank: string | null;
  reference: string | null;
  chequeDate: string | null;
  payerName: string | null;
  studentId: string;
  names: StudentNames | null;
  className: string | null;
  receivedBy: string | null;
  /** `date` = the school's day of the cancellation (from the database's clock). */
  cancelled: { date: string; reason: string; by: string | null } | null;
};

export type Journal = {
  from: string;
  to: string;
  /** Receipts dated in the range (cancelled ones included), oldest first. */
  payments: JournalPayment[];
  /** Earlier receipts cancelled in the range. */
  cancellations: JournalPayment[];
  totals: JournalTotals;
};

const PAYMENT_COLUMNS =
  "id, academic_year_id, student_id, receipt_label, receipt_no, amount_centimes, method, bank, reference, cheque_date, payer_name, paid_on, created_at, received_by, cancelled_at, cancelled_by, cancel_reason";

export async function getJournal(schoolId: string, from: string, to: string): Promise<Journal> {
  const supabase = await createClient();
  const [inRange, cancelledCandidates] = await Promise.all([
    readAll(
      (a, b) =>
        supabase
          .from("payments")
          .select(PAYMENT_COLUMNS)
          .eq("school_id", schoolId)
          .gte("paid_on", from)
          .lte("paid_on", to)
          .order("id")
          .range(a, b),
      "getJournal",
    ),
    // Earlier receipts cancelled around the range; the school's day of each is checked below.
    readAll(
      (a, b) =>
        supabase
          .from("payments")
          .select(PAYMENT_COLUMNS)
          .eq("school_id", schoolId)
          .lt("paid_on", from)
          .gte("cancelled_at", `${dayAdd(from, -1)}T00:00:00Z`)
          .lt("cancelled_at", `${dayAdd(to, 2)}T00:00:00Z`)
          .order("id")
          .range(a, b),
      "getJournal",
    ),
  ]);
  const cancelledDay = new Map<string, string>();
  await Promise.all(
    [...inRange, ...cancelledCandidates]
      .filter((p) => p.cancelled_at)
      .map(async (p) => cancelledDay.set(p.id, (await schoolClock(p.cancelled_at!)).date)),
  );
  const earlier = cancelledCandidates.filter((p) => {
    const day = cancelledDay.get(p.id);
    return !!day && day >= from && day <= to;
  });
  const all = [...inRange, ...earlier];

  const studentIds = [...new Set(all.map((p) => p.student_id))];
  const staffIds = [...new Set(all.flatMap((p) => [p.received_by, p.cancelled_by]).filter((x): x is string => !!x))];
  const [names, enrollments, staff] = await Promise.all([
    studentsById(supabase, studentIds),
    inChunks(studentIds, (chunk) =>
      supabase
        .from("student_enrollments")
        .select("student_id, academic_year_id, class:classes(name)")
        .eq("school_id", schoolId)
        .in("student_id", chunk),
    ),
    inChunks(staffIds, (chunk) => supabase.rpc("fee_staff_names", { p_ids: chunk })),
  ]);
  const classOf = new Map(enrollments.map((e) => [`${e.student_id}:${e.academic_year_id}`, e.class?.name ?? null]));
  const staffName = new Map(staff.map((s) => [s.id, s.full_name]));

  const toRow = (p: (typeof all)[number]): JournalPayment => ({
    id: p.id,
    receiptLabel: p.receipt_label,
    paidOn: p.paid_on,
    amount: p.amount_centimes,
    method: p.method as PaymentMethod,
    bank: p.bank,
    reference: p.reference,
    chequeDate: p.cheque_date,
    payerName: p.payer_name,
    studentId: p.student_id,
    names: names.get(p.student_id) ?? null,
    className: classOf.get(`${p.student_id}:${p.academic_year_id}`) ?? null,
    receivedBy: p.received_by ? (staffName.get(p.received_by) ?? null) : null,
    cancelled: p.cancelled_at
      ? { date: cancelledDay.get(p.id) ?? p.cancelled_at.slice(0, 10), reason: p.cancel_reason ?? "other", by: p.cancelled_by ? (staffName.get(p.cancelled_by) ?? null) : null }
      : null,
  });
  const order = (a: { paid_on: string; created_at: string }, b: { paid_on: string; created_at: string }) =>
    a.paid_on.localeCompare(b.paid_on) || a.created_at.localeCompare(b.created_at);
  const payments = [...inRange].sort(order).map(toRow);
  return {
    from,
    to,
    payments,
    cancellations: [...earlier].sort(order).map(toRow),
    totals: journalTotals(payments),
  };
}

// --- Dashboard --------------------------------------------------------------------------------------------

export type FeeSummary = { collectedMonth: number; receiptsMonth: number; unpaid: number; unpaidStudents: number };

/** The two dashboard figures; null without fees.view / the module (the function returns no row). */
export async function getFeeSummary(yearId: string): Promise<FeeSummary | null> {
  const { data, error } = await (await createClient()).rpc("fee_summary", { p_year: yearId });
  if (error) throw new Error("getFeeSummary failed");
  const row = data[0];
  return row
    ? { collectedMonth: row.collected_month_centimes, receiptsMonth: row.receipts_month, unpaid: row.unpaid_centimes, unpaidStudents: row.unpaid_students }
    : null;
}
