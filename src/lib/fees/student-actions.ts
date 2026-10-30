"use server";

import { auditStructure, parseInput, type StructureActionResult } from "@/lib/structure/action-utils";
import { createClient } from "@/lib/supabase/server";
import { discountSchema, feeIdSchema, studentServiceSchema } from "@/lib/validations/fees";

import { feesErrorKey, getFeesActor } from "./actor";

// A student's services (fees.manage) and discounts (fees.cancel: director by
// default) for a year, from the student page. Discount changes are logged by
// the database trigger (student_discounts_audit), so not here a second time.
// Error keys: `fees.errors`.

type PeriodField = "serviceId" | "fromMonth" | "toMonth";
type DiscountField = "value" | "reason";

const PERIOD_FIELDS: Record<string, PeriodField> = {
  periodOverlap: "fromMonth",
  monthOutsideYear: "fromMonth",
  toBeforeFrom: "toMonth",
};

export async function addStudentService(
  studentId: unknown,
  yearId: unknown,
  input: unknown,
): Promise<StructureActionResult<{ id: string }, PeriodField>> {
  const actor = await getFeesActor("fees.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const student = feeIdSchema.safeParse(studentId);
  const year = feeIdSchema.safeParse(yearId);
  if (!student.success || !year.success) return { ok: false, error: "notFound" };
  const v = parseInput<typeof studentServiceSchema, PeriodField>(studentServiceSchema, input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const { data, error } = await (await createClient())
    .from("student_services")
    .insert({
      school_id: actor.schoolId,
      academic_year_id: year.data,
      student_id: student.data,
      service_id: v.values.serviceId,
      from_month: v.values.fromMonth,
      to_month: v.values.toMonth,
    })
    .select("id")
    .single();
  if (error) {
    const key = feesErrorKey(error);
    return { ok: false, error: key, field: PERIOD_FIELDS[key] };
  }

  await auditStructure(actor, "fees.student_service.add", "student", student.data, {
    service_id: v.values.serviceId,
    from_month: v.values.fromMonth,
    to_month: v.values.toMonth,
  });
  return { ok: true, data: { id: data.id } };
}

/** New months for a period (the service itself does not change: remove and add instead). */
export async function updateStudentService(
  periodId: unknown,
  input: unknown,
): Promise<StructureActionResult<null, PeriodField>> {
  const actor = await getFeesActor("fees.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = feeIdSchema.safeParse(periodId);
  if (!id.success) return { ok: false, error: "notFound" };
  const v = parseInput<typeof studentServiceSchema, PeriodField>(studentServiceSchema, input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const { data, error } = await (await createClient())
    .from("student_services")
    .update({ from_month: v.values.fromMonth, to_month: v.values.toMonth })
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .select("student_id");
  if (error) {
    const key = feesErrorKey(error);
    return { ok: false, error: key, field: PERIOD_FIELDS[key] };
  }
  if (data.length === 0) return { ok: false, error: "notFound" };

  await auditStructure(actor, "fees.student_service.update", "student", data[0].student_id, {
    period_id: id.data,
    from_month: v.values.fromMonth,
    to_month: v.values.toMonth,
  });
  return { ok: true, data: null };
}

export async function removeStudentService(periodId: unknown): Promise<StructureActionResult<null>> {
  const actor = await getFeesActor("fees.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = feeIdSchema.safeParse(periodId);
  if (!id.success) return { ok: false, error: "notFound" };

  const { data, error } = await (await createClient())
    .from("student_services")
    .delete()
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .select("student_id, service_id, from_month, to_month");
  if (error) return { ok: false, error: feesErrorKey(error) };
  if (data.length === 0) return { ok: false, error: "notFound" };

  await auditStructure(actor, "fees.student_service.remove", "student", data[0].student_id, {
    service_id: data[0].service_id,
    from_month: data[0].from_month,
    to_month: data[0].to_month,
  });
  return { ok: true, data: null };
}

/** Create (no `discountId`) or change a discount. The kind of an existing discount does not change. */
export async function saveStudentDiscount(
  studentId: unknown,
  yearId: unknown,
  input: unknown,
  discountId?: unknown,
): Promise<StructureActionResult<null, DiscountField>> {
  const actor = await getFeesActor("fees.cancel");
  if (!actor) return { ok: false, error: "forbidden" };
  const student = feeIdSchema.safeParse(studentId);
  const year = feeIdSchema.safeParse(yearId);
  if (!student.success || !year.success) return { ok: false, error: "notFound" };
  const v = parseInput<typeof discountSchema, DiscountField>(discountSchema, input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const supabase = await createClient();
  const values = {
    percent_bp: v.values.percentBp,
    amount_centimes: v.values.amountCentimes,
    applies_to: v.values.appliesTo,
    reason: v.values.reason,
  };
  if (discountId === undefined) {
    const { error } = await supabase.from("student_discounts").insert({
      ...values,
      school_id: actor.schoolId,
      academic_year_id: year.data,
      student_id: student.data,
      kind: v.values.kind,
    });
    if (error) return discountFailure(feesErrorKey(error));
    return { ok: true, data: null };
  }

  const id = feeIdSchema.safeParse(discountId);
  if (!id.success) return { ok: false, error: "notFound" };
  const { data, error } = await supabase
    .from("student_discounts")
    .update(values)
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .eq("student_id", student.data)
    .select("id");
  if (error) return discountFailure(feesErrorKey(error));
  if (data.length === 0) return { ok: false, error: "notFound" };
  return { ok: true, data: null };
}

export async function deleteStudentDiscount(discountId: unknown): Promise<StructureActionResult<null>> {
  const actor = await getFeesActor("fees.cancel");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = feeIdSchema.safeParse(discountId);
  if (!id.success) return { ok: false, error: "notFound" };

  const { data, error } = await (await createClient())
    .from("student_discounts")
    .delete()
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .select("id");
  if (error) return { ok: false, error: feesErrorKey(error) };
  if (data.length === 0) return { ok: false, error: "notFound" };
  return { ok: true, data: null };
}

function discountFailure(error: string): StructureActionResult<never, DiscountField> {
  if (error === "percentRange" || error === "amountInvalid") return { ok: false, error, field: "value" };
  return { ok: false, error };
}
