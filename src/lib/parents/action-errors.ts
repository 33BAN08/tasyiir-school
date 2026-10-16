import "server-only";

import { logAudit } from "@/lib/audit";
import type { SchoolActor } from "@/lib/auth/school-actor";
import type { GuardianFormValues, LinkFormValues } from "@/lib/validations/parents";

// Shared by the parents Server Actions (guardian-actions, student-guardian-actions).
// Error keys: `parents.errors`.

export type GuardianField = keyof GuardianFormValues;
export type Result<T, F extends string = never> = { ok: true; data: T } | { ok: false; error: string; field?: F };

export const GUARDIAN_CONSTRAINTS = {
  guardians_phone_key: "phoneTaken",
  guardians_phone_check: "invalidPhone",
  guardians_email_check: "invalidEmail",
};
export const LINK_CONSTRAINTS = {
  student_guardians_pkey: "alreadyLinked",
  student_guardians_parent_key: "relationTaken",
  student_guardians_student_fkey: "studentNotFound",
};
export const GUARDIAN_FIELD_OF: Record<string, GuardianField> = {
  phoneTaken: "phone",
  invalidPhone: "phone",
  phoneHasAccount: "phone",
  invalidEmail: "email",
};
export const LINK_FIELD_OF: Record<string, keyof LinkFormValues> = {
  relationTaken: "relation",
  alreadyLinked: "studentId",
  studentNotFound: "studentId",
};

export function failure<F extends string>(key: string, fields: Record<string, F> = {}): { ok: false; error: string; field?: F } {
  return { ok: false, error: key, field: fields[key] };
}

export function auditGuardian(actor: SchoolActor, action: string, guardianId: string, data: Record<string, string | null> = {}) {
  return logAudit({ actorId: actor.id, schoolId: actor.schoolId, action, entity: "guardian", entityId: guardianId, data });
}
