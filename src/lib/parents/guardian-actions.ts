"use server";

import { getSchoolActor } from "@/lib/auth/school-actor";
import {
  auditGuardian as audit,
  failure,
  GUARDIAN_CONSTRAINTS,
  GUARDIAN_FIELD_OF as FIELD_OF,
  LINK_CONSTRAINTS,
  LINK_FIELD_OF,
  type GuardianField,
  type Result,
} from "@/lib/parents/action-errors";
import { isParentAccount, syncParentAccount } from "@/lib/parents/parent-accounts";
import { parseInput } from "@/lib/structure/action-utils";
import { dbErrorKey } from "@/lib/structure/db-errors";
import { ilikeAny } from "@/lib/search";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  guardianIdSchema,
  guardianSchema,
  linkSchema,
  studentSearchSchema,
  type LinkFormValues,
} from "@/lib/validations/parents";
import { studentIdSchema } from "@/lib/validations/students";

// Guardians and their links to students (parents.manage), written through RLS
// with the caller's session. The secret key only touches the parent's AUTH
// account (sign-in phone, name, deletion). Error keys: `parents.errors`.

export async function createGuardian(input: unknown): Promise<Result<{ id: string }, GuardianField>> {
  const actor = await getSchoolActor("parents.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const v = parseInput<typeof guardianSchema, GuardianField>(guardianSchema, input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const { data, error } = await (await createClient())
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
  if (error) return failure(dbErrorKey(error, GUARDIAN_CONSTRAINTS), FIELD_OF);

  await audit(actor, "guardian.create", data.id, { name: `${v.values.lastName} ${v.values.firstName}` });
  return { ok: true, data: { id: data.id } };
}

/**
 * Edits a guardian. With a parent account, the account follows: a new phone
 * becomes the new sign-in (same account, same password), a new name the
 * account's name. The account is changed first; if the guardian row then
 * fails, the account is put back.
 */
export async function updateGuardian(guardianId: unknown, input: unknown): Promise<Result<null, GuardianField>> {
  const actor = await getSchoolActor("parents.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = guardianIdSchema.safeParse(guardianId);
  if (!id.success) return { ok: false, error: "notFound" };
  const v = parseInput<typeof guardianSchema, GuardianField>(guardianSchema, input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("guardians")
    .select("last_name, first_name, phone, profile_id")
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .maybeSingle();
  if (!before) return { ok: false, error: "notFound" };

  const account = before.profile_id && (await isParentAccount(actor.schoolId, before.profile_id)) ? before.profile_id : null;
  const next = { phone: v.values.phone, fullName: `${v.values.firstName} ${v.values.lastName}` };
  const previous = { phone: before.phone, fullName: `${before.first_name} ${before.last_name}` };
  if (account) {
    const synced = await syncParentAccount(actor.schoolId, account, next);
    if (synced) return failure(synced, FIELD_OF);
  }

  const { error } = await supabase
    .from("guardians")
    .update({
      last_name: v.values.lastName,
      first_name: v.values.firstName,
      phone: v.values.phone,
      email: v.values.email || null,
    })
    .eq("id", id.data)
    .eq("school_id", actor.schoolId);
  if (error) {
    if (account) await syncParentAccount(actor.schoolId, account, previous);
    return failure(dbErrorKey(error, GUARDIAN_CONSTRAINTS), FIELD_OF);
  }

  await audit(actor, "guardian.update", id.data, {
    name: `${v.values.lastName} ${v.values.firstName}`,
    phoneChanged: before.phone === v.values.phone ? null : "yes",
  });
  return { ok: true, data: null };
}

/** Deletes the guardian, their links and their parent account (if any). */
export async function deleteGuardian(guardianId: unknown): Promise<Result<null>> {
  const actor = await getSchoolActor("parents.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = guardianIdSchema.safeParse(guardianId);
  if (!id.success) return { ok: false, error: "notFound" };

  const { data, error } = await (await createClient())
    .from("guardians")
    .delete()
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .select("last_name, first_name, profile_id");
  if (error) return { ok: false, error: dbErrorKey(error) };
  if (data.length === 0) return { ok: false, error: "notFound" };

  const profileId = data[0].profile_id;
  if (profileId && (await isParentAccount(actor.schoolId, profileId))) {
    const { error: authError } = await createAdminClient().auth.admin.deleteUser(profileId);
    if (authError) console.error("deleteGuardian: deleteUser failed", authError.code);
  }

  await audit(actor, "guardian.delete", id.data, { name: `${data[0].last_name} ${data[0].first_name}` });
  return { ok: true, data: null };
}

export async function linkChild(guardianId: unknown, input: unknown): Promise<Result<null, keyof LinkFormValues>> {
  const actor = await getSchoolActor("parents.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = guardianIdSchema.safeParse(guardianId);
  if (!id.success) return { ok: false, error: "notFound" };
  const v = parseInput<typeof linkSchema, keyof LinkFormValues>(linkSchema, input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const { error } = await (await createClient()).from("student_guardians").insert({
    school_id: actor.schoolId,
    guardian_id: id.data,
    student_id: v.values.studentId,
    relation: v.values.relation,
  });
  if (error) {
    const key = dbErrorKey(error, LINK_CONSTRAINTS);
    // The guardian of another school (or a missing one) fails its foreign key too.
    return failure(key === "inUse" ? "notFound" : key, LINK_FIELD_OF);
  }

  await audit(actor, "guardian.link", id.data, { studentId: v.values.studentId, relation: v.values.relation });
  return { ok: true, data: null };
}

export async function unlinkChild(guardianId: unknown, studentId: unknown): Promise<Result<null>> {
  const actor = await getSchoolActor("parents.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const gid = guardianIdSchema.safeParse(guardianId);
  const sid = studentIdSchema.safeParse(studentId);
  if (!gid.success || !sid.success) return { ok: false, error: "notFound" };

  const { data, error } = await (await createClient())
    .from("student_guardians")
    .delete()
    .eq("guardian_id", gid.data)
    .eq("student_id", sid.data)
    .eq("school_id", actor.schoolId)
    .select("student_id");
  if (error) return { ok: false, error: dbErrorKey(error) };
  if (data.length === 0) return { ok: false, error: "notFound" };

  await audit(actor, "guardian.unlink", gid.data, { studentId: sid.data });
  return { ok: true, data: null };
}

export type StudentMatch = {
  id: string;
  firstName: string;
  lastName: string;
  firstNameAr: string | null;
  lastNameAr: string | null;
  codeMassar: string | null;
};

/** Up to 10 students of the school matching a name or Massar code, to link (needs reading students too). */
export async function searchStudentsToLink(query: unknown): Promise<Result<StudentMatch[]>> {
  const actor = await getSchoolActor("parents.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const q = studentSearchSchema.safeParse(query);
  if (!q.success) return { ok: false, error: "generic" };

  let request = (await createClient())
    .from("students")
    .select("id, first_name, last_name, first_name_ar, last_name_ar, code_massar")
    .eq("school_id", actor.schoolId)
    .order("last_name")
    .order("first_name")
    .limit(10);
  for (const term of q.data.split(/\s+/).filter(Boolean).slice(0, 4)) {
    const filter = ilikeAny(term, ["last_name", "first_name", "last_name_ar", "first_name_ar", "code_massar"]);
    if (filter) request = request.or(filter);
  }
  const { data, error } = await request;
  if (error) return { ok: false, error: dbErrorKey(error) };
  return {
    ok: true,
    data: data.map((s) => ({
      id: s.id,
      firstName: s.first_name,
      lastName: s.last_name,
      firstNameAr: s.first_name_ar,
      lastNameAr: s.last_name_ar,
      codeMassar: s.code_massar,
    })),
  };
}
