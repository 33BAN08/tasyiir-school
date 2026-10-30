import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { DiscountKind, DiscountTarget } from "@/lib/validations/fees";

// Reads for the fee settings page and the student page's "Frais" card,
// through RLS: fees.view while the fees module is on. The explicit school
// filter is a second fence. Amounts are centimes.

export type FeeMonths = { months: string[]; dueDay: number; customised: boolean };

/** The year's billed months and due day (the defaults when the school changed nothing). */
export async function getFeeMonths(yearId: string): Promise<FeeMonths | null> {
  const { data, error } = await (await createClient()).rpc("fee_year_rules", { p_year: yearId });
  if (error) throw new Error("getFeeMonths failed");
  const row = data[0];
  return row ? { months: row.billing_months, dueDay: row.due_day, customised: row.customised } : null;
}

export type FeePlan = { id: string; levelId: string; registration: number; monthly: number };

export async function listFeePlans(schoolId: string, yearId: string): Promise<FeePlan[]> {
  const { data, error } = await (await createClient())
    .from("fee_plans")
    .select("id, level_id, registration_centimes, monthly_centimes")
    .eq("school_id", schoolId)
    .eq("academic_year_id", yearId);
  if (error) throw new Error("listFeePlans failed");
  return data.map((p) => ({
    id: p.id,
    levelId: p.level_id,
    registration: p.registration_centimes,
    monthly: p.monthly_centimes,
  }));
}

export type FeeService = {
  id: string;
  name: string;
  nameAr: string | null;
  monthly: number;
  active: boolean;
  /** Students with at least one period of this service. */
  students: number;
};

export async function listFeeServices(schoolId: string, yearId: string): Promise<FeeService[]> {
  const { data, error } = await (await createClient())
    .from("fee_services")
    .select("id, name, name_ar, monthly_centimes, active, position, student_services(student_id)")
    .eq("school_id", schoolId)
    .eq("academic_year_id", yearId)
    .order("position")
    .order("name");
  if (error) throw new Error("listFeeServices failed");
  return data.map((s) => ({
    id: s.id,
    name: s.name,
    nameAr: s.name_ar,
    monthly: s.monthly_centimes,
    active: s.active,
    students: new Set(s.student_services.map((p) => p.student_id)).size,
  }));
}

export type StudentServicePeriod = {
  id: string;
  serviceId: string;
  fromMonth: string;
  toMonth: string | null;
};

export type StudentDiscount = {
  id: string;
  kind: DiscountKind;
  percentBp: number | null;
  amountCentimes: number | null;
  appliesTo: DiscountTarget;
  reason: string | null;
};

export type Sibling = { id: string; lastName: string; firstName: string; className: string | null };

export type StudentFees = {
  enrolled: boolean;
  levelId: string | null;
  levelName: string | null;
  plan: FeePlan | null;
  periods: StudentServicePeriod[];
  discounts: StudentDiscount[];
  /** Other students of the school sharing a guardian (a hint for the sibling discount). */
  siblings: Sibling[];
};

/** One student's fee setup for a year. */
export async function getStudentFees(schoolId: string, yearId: string, studentId: string): Promise<StudentFees> {
  const supabase = await createClient();
  const [enrollment, periods, discounts, links] = await Promise.all([
    supabase
      .from("student_enrollments")
      .select("class:classes(level_id, level:levels(name))")
      .eq("school_id", schoolId)
      .eq("academic_year_id", yearId)
      .eq("student_id", studentId)
      .maybeSingle(),
    supabase
      .from("student_services")
      .select("id, service_id, from_month, to_month")
      .eq("school_id", schoolId)
      .eq("academic_year_id", yearId)
      .eq("student_id", studentId)
      .order("from_month"),
    supabase
      .from("student_discounts")
      .select("id, kind, percent_bp, amount_centimes, applies_to, reason")
      .eq("school_id", schoolId)
      .eq("academic_year_id", yearId)
      .eq("student_id", studentId)
      .order("kind"),
    supabase.from("student_guardians").select("guardian_id").eq("school_id", schoolId).eq("student_id", studentId),
  ]);
  if (enrollment.error || periods.error || discounts.error || links.error) throw new Error("getStudentFees failed");

  const levelId = enrollment.data?.class?.level_id ?? null;
  const [plan, siblings] = await Promise.all([
    levelId
      ? supabase
          .from("fee_plans")
          .select("id, level_id, registration_centimes, monthly_centimes")
          .eq("school_id", schoolId)
          .eq("academic_year_id", yearId)
          .eq("level_id", levelId)
          .maybeSingle()
      : null,
    listSiblings(schoolId, yearId, studentId, links.data.map((l) => l.guardian_id)),
  ]);
  if (plan?.error) throw new Error("getStudentFees failed");

  return {
    enrolled: enrollment.data !== null,
    levelId,
    levelName: enrollment.data?.class?.level?.name ?? null,
    plan: plan?.data
      ? {
          id: plan.data.id,
          levelId: plan.data.level_id,
          registration: plan.data.registration_centimes,
          monthly: plan.data.monthly_centimes,
        }
      : null,
    periods: periods.data.map((p) => ({ id: p.id, serviceId: p.service_id, fromMonth: p.from_month, toMonth: p.to_month })),
    discounts: discounts.data.map((d) => ({
      id: d.id,
      kind: d.kind as DiscountKind,
      percentBp: d.percent_bp,
      amountCentimes: d.amount_centimes,
      appliesTo: d.applies_to as DiscountTarget,
      reason: d.reason,
    })),
    siblings,
  };
}

async function listSiblings(schoolId: string, yearId: string, studentId: string, guardianIds: string[]): Promise<Sibling[]> {
  if (guardianIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("student_guardians")
    .select("student:students(id, last_name, first_name, student_enrollments(academic_year_id, class:classes(name)))")
    .eq("school_id", schoolId)
    .in("guardian_id", guardianIds)
    .neq("student_id", studentId);
  if (error) throw new Error("listSiblings failed");
  const byId = new Map<string, Sibling>();
  for (const { student } of data) {
    if (!student || byId.has(student.id)) continue;
    const enrollment = student.student_enrollments.find((e) => e.academic_year_id === yearId);
    byId.set(student.id, {
      id: student.id,
      lastName: student.last_name,
      firstName: student.first_name,
      className: enrollment?.class?.name ?? null,
    });
  }
  return [...byId.values()].sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
}
