import "server-only";

import { getModules } from "@/lib/auth/modules";
import { getSchoolActor, type SchoolActor } from "@/lib/auth/school-actor";
import { dbErrorKey } from "@/lib/structure/db-errors";

// Shared by the fees Server Actions. Error keys: `fees.errors`.

/** The caller when they hold `permission` and the fees module is on; null otherwise (RLS refuses too). */
export async function getFeesActor(permission: "fees.manage" | "fees.cancel"): Promise<SchoolActor | null> {
  const actor = await getSchoolActor(permission);
  if (!actor) return null;
  return (await getModules()).has("fees") ? actor : null;
}

/** Errors raised by the fee tables (constraint names and trigger messages) → `fees.errors` keys. */
const FEE_ERRORS: Record<string, string> = {
  // Raised by the fees RPCs (private.fees_require and their own checks).
  fees_forbidden: "forbidden",
  fees_year_not_found: "notFound",
  fees_student_not_found: "notFound",
  fees_rows_invalid: "generic",
  // A service whose charges still exist (cancelled ones included).
  student_charges_service_fkey: "serviceInUse",
  fees_billing_months_invalid: "monthsInvalid",
  fees_month_outside_year: "monthOutsideYear",
  fees_student_not_enrolled: "notEnrolled",
  // Another school's year that already has a row (the key is the year).
  fee_years_pkey: "notFound",
  fee_years_due_day_check: "dueDayRange",
  fee_years_months_count_check: "monthsRequired",
  fee_plans_registration_check: "amountInvalid",
  fee_plans_monthly_check: "amountInvalid",
  fee_services_monthly_check: "amountInvalid",
  fee_services_name_key: "serviceNameTaken",
  fee_services_name_check: "nameRequired",
  student_services_no_overlap: "periodOverlap",
  student_services_to_check: "toBeforeFrom",
  student_discounts_kind_key: "discountKindTaken",
  student_discounts_percent_check: "percentRange",
  student_discounts_amount_check: "amountInvalid",
};

type PgError = { code?: string; message?: string; details?: string | null };

export function feesErrorKey(error: PgError): string {
  const key = dbErrorKey(error, FEE_ERRORS);
  // A foreign key that does not match: an id of another school or year.
  return key === "inUse" ? "notFound" : key;
}
