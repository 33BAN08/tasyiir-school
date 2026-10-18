"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { routing } from "@/i18n/routing";
import { getSchoolActor } from "@/lib/auth/school-actor";
import { auditStructure, parseInput, type StructureActionResult } from "@/lib/structure/action-utils";
import { dbErrorKey } from "@/lib/structure/db-errors";
import { SUBJECT_TEMPLATE } from "@/lib/structure/subject-template";
import { presentTemplateSubjects } from "@/lib/structure/subjects";
import { createClient } from "@/lib/supabase/server";
import {
  structureIdSchema,
  subjectSchema,
  subjectTemplateSelectionSchema,
  type SubjectFormValues,
} from "@/lib/validations/structure";

// Subjects (structure.manage), written through RLS with the caller's session.
// Error keys: `setup.errors`.

type SubjectField = keyof SubjectFormValues;

const SUBJECT_CONSTRAINTS = {
  subjects_name_key: "subjectNameTaken",
  subjects_code_key: "subjectCodeTaken",
  subjects_code_check: "codeTooLong",
};
const FIELD_OF: Record<string, SubjectField> = {
  subjectNameTaken: "name",
  subjectCodeTaken: "code",
  codeTooLong: "code",
};

function failure(key: string): { ok: false; error: string; field?: SubjectField } {
  return { ok: false, error: key, field: FIELD_OF[key] };
}

export async function createSubject(input: unknown): Promise<StructureActionResult<{ id: string }, SubjectField>> {
  const actor = await getSchoolActor("structure.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const v = parseInput<typeof subjectSchema, SubjectField>(subjectSchema, input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const { data, error } = await (await createClient())
    .from("subjects")
    .insert({ school_id: actor.schoolId, name: v.values.name, code: v.values.code || null, color: v.values.color })
    .select("id")
    .single();
  if (error) return failure(dbErrorKey(error, SUBJECT_CONSTRAINTS));

  await auditStructure(actor, "subject.create", "subject", data.id, { name: v.values.name });
  return { ok: true, data: { id: data.id } };
}

export async function updateSubject(subjectId: unknown, input: unknown): Promise<StructureActionResult<null, SubjectField>> {
  const actor = await getSchoolActor("structure.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = structureIdSchema.safeParse(subjectId);
  if (!id.success) return { ok: false, error: "notFound" };
  const v = parseInput<typeof subjectSchema, SubjectField>(subjectSchema, input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const { data, error } = await (await createClient())
    .from("subjects")
    .update({ name: v.values.name, code: v.values.code || null, color: v.values.color })
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .select("id");
  if (error) return failure(dbErrorKey(error, SUBJECT_CONSTRAINTS));
  if (data.length === 0) return { ok: false, error: "notFound" };

  await auditStructure(actor, "subject.update", "subject", id.data, { name: v.values.name });
  return { ok: true, data: null };
}

export async function deleteSubject(subjectId: unknown): Promise<StructureActionResult<null>> {
  const actor = await getSchoolActor("structure.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = structureIdSchema.safeParse(subjectId);
  if (!id.success) return { ok: false, error: "notFound" };

  const { data, error } = await (await createClient())
    .from("subjects")
    .delete()
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .select("name");
  if (error) {
    return {
      ok: false,
      error: dbErrorKey(error, {
        lessons_subject_fkey: "subjectHasLessons",
        lessons_teacher_subject_fkey: "subjectHasLessons",
        attendance_sessions_subject_fkey: "subjectHasAttendance",
      }),
    };
  }
  if (data.length === 0) return { ok: false, error: "notFound" };

  await auditStructure(actor, "subject.delete", "subject", id.data, { name: data[0].name });
  return { ok: true, data: null };
}

const localeSchema = z.enum(routing.locales);

/**
 * Creates the picked template subjects the school does not have yet (by code,
 * or by name in any UI language), named in the director's language. A code
 * already in use means the subject is there (possibly renamed), so it is skipped.
 */
export async function applySubjectTemplate(
  selection: unknown,
  locale: unknown,
): Promise<StructureActionResult<{ created: number }>> {
  const actor = await getSchoolActor("structure.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const picked = subjectTemplateSelectionSchema.safeParse(selection);
  const lang = localeSchema.safeParse(locale);
  if (!picked.success || !lang.success) return { ok: false, error: "generic" };

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("subjects")
    .select("name, code")
    .eq("school_id", actor.schoolId);
  if (readError) return { ok: false, error: "generic" };
  const present = await presentTemplateSubjects(existing);
  const t = await getTranslations({ locale: lang.data, namespace: "setup.subjects.template.names" });

  const wanted = new Set(picked.data);
  const rows = SUBJECT_TEMPLATE.filter((s) => wanted.has(s.key) && !present.has(s.key)).map((s) => ({
    school_id: actor.schoolId,
    name: t(s.key as Parameters<typeof t>[0]),
    code: s.code,
    color: s.color,
  }));
  if (rows.length > 0) {
    const { error } = await supabase.from("subjects").insert(rows);
    if (error) return { ok: false, error: dbErrorKey(error, SUBJECT_CONSTRAINTS) };
  }

  await auditStructure(actor, "subject.template", "school", actor.schoolId, { subjects: rows.length });
  return { ok: true, data: { created: rows.length } };
}
