import { z } from "zod";

import { emailField, localeField, optionalPhoneField, personNameField } from "@/lib/validations/fields";
import { enumParam, pageParam, searchParam, uuidParam } from "@/lib/validations/list-params";

/** active = signed in with own password; pending = still on the temporary one. */
export const STAFF_STATUSES = ["active", "pending", "deactivated"] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];

export const STAFF_PAGE_SIZE = 20;

/** URL query of the staff list. Invalid values fall back to defaults, never error. */
export const staffListParamsSchema = z.object({
  q: searchParam,
  role: uuidParam,
  status: enumParam(STAFF_STATUSES),
  page: pageParam,
});

export type StaffListParams = z.infer<typeof staffListParamsSchema>;

// Staff forms. Error messages are next-intl keys under `staff.errors`.

export const newStaffSchema = z.object({
  fullName: personNameField,
  email: emailField,
  roleId: z.uuid({ error: "roleRequired" }),
  phone: optionalPhoneField,
  locale: localeField,
});
export type NewStaffFormValues = z.input<typeof newStaffSchema>;
export type NewStaffInput = z.output<typeof newStaffSchema>;

export const staffIdSchema = z.uuid();

/** Editable details of a staff account (the email is the sign-in identity: not editable here). */
export const staffDetailsSchema = z.object({
  fullName: personNameField,
  phone: optionalPhoneField,
  locale: localeField,
});
export type StaffDetailsFormValues = z.input<typeof staffDetailsSchema>;
export type StaffDetailsInput = z.output<typeof staffDetailsSchema>;

export const staffRoleSchema = z.object({ roleId: z.uuid({ error: "roleRequired" }) });

export const staffActiveSchema = z.boolean();
