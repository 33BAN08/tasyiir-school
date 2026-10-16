"use server";

import { getSchoolActor } from "@/lib/auth/school-actor";
import {
  auditGuardian,
  failure,
  GUARDIAN_CONSTRAINTS,
  GUARDIAN_FIELD_OF,
  LINK_CONSTRAINTS,
  type Result,
} from "@/lib/parents/action-errors";
import { guardianSearchFilter } from "@/lib/parents/guardians";
import { parseInput } from "@/lib/structure/action-utils";
import { dbErrorKey } from "@/lib/structure/db-errors";
import { createClient } from "@/lib/supabase/server";
import {
  guardianSearchSchema,
  newGuardianLinkSchema,
  type NewGuardianLinkValues,
} from "@/lib/validations/parents";
import { studentIdSchema } from "@/lib/validations/students";

// Parents from a STUDENT's page (parents.manage), through RLS with the
// caller's session. Linking an existing guardian and removing a link reuse
// linkChild / unlinkChild (guardian-actions). Error keys: `parents.errors`.

type NewGuardianField = keyof NewGuardianLinkValues;

export type GuardianMatch = { id: string; lastName: string; firstName: string; phone: string };

/** Up to 10 guardians of the school matching a name or a phone number. */
export async function searchGuardiansToLink(query: unknown): Promise<Result<GuardianMatch[]>> {
  const actor = await getSchoolActor("parents.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const q = guardianSearchSchema.safeParse(query);
  if (!q.success) return { ok: false, error: "generic" };

  let request = (await createClient())
    .from("guardians")
    .select("id, last_name, first_name, phone")
    .eq("school_id", actor.schoolId)
    .order("last_name")
    .order("first_name")
    .limit(10);
  for (const term of q.data.split(/\s+(?=\D)/).filter(Boolean).slice(0, 4)) {
    const filter = guardianSearchFilter(term);
    if (filter) request = request.or(filter);
  }
  const { data, error } = await request;
  if (error) return { ok: false, error: dbErrorKey(error) };
  return {
    ok: true,
    data: data.map((g) => ({ id: g.id, lastName: g.last_name, firstName: g.first_name, phone: g.phone })),
  };
}

/**
 * Creates a guardian and links them to this student. Two writes: if the link
 * fails (e.g. the student already has a father), the new guardian is deleted
 * again, so nothing half-done stays behind.
 */
export async function createGuardianForStudent(
  studentId: unknown,
  input: unknown,
): Promise<Result<{ id: string }, NewGuardianField>> {
  const actor = await getSchoolActor("parents.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const sid = studentIdSchema.safeParse(studentId);
  if (!sid.success) return { ok: false, error: "studentNotFound" };
  const v = parseInput<typeof newGuardianLinkSchema, NewGuardianField>(newGuardianLinkSchema, input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("guardians")
    .insert({
      school_id: actor.schoolId,
      last_name: v.values.lastName,
      first_name: v.values.firstName,
      phone: v.values.phone,
      email: v.values.email || null,
    })
    .select("id")
    .single();
  if (error) return failure(dbErrorKey(error, GUARDIAN_CONSTRAINTS), GUARDIAN_FIELD_OF);

  const { error: linkError } = await supabase.from("student_guardians").insert({
    school_id: actor.schoolId,
    guardian_id: data.id,
    student_id: sid.data,
    relation: v.values.relation,
  });
  if (linkError) {
    await supabase.from("guardians").delete().eq("id", data.id).eq("school_id", actor.schoolId);
    const key = dbErrorKey(linkError, LINK_CONSTRAINTS);
    return failure(key === "inUse" ? "studentNotFound" : key, { relationTaken: "relation" } as Record<string, NewGuardianField>);
  }

  const name = `${v.values.lastName} ${v.values.firstName}`;
  await auditGuardian(actor, "guardian.create", data.id, { name });
  await auditGuardian(actor, "guardian.link", data.id, { studentId: sid.data, relation: v.values.relation });
  return { ok: true, data: { id: data.id } };
}
