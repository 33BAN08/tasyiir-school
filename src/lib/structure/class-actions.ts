"use server";

import { getSchoolActor } from "@/lib/auth/school-actor";
import { auditStructure, parseInput, type StructureActionResult } from "@/lib/structure/action-utils";
import { suggestClassNames } from "@/lib/structure/class-names";
import { dbErrorKey } from "@/lib/structure/db-errors";
import { createClient } from "@/lib/supabase/server";
import {
  classBatchSchema,
  classSchema,
  structureIdSchema,
  type ClassBatchFormValues,
  type ClassFormValues,
} from "@/lib/validations/structure";

// Classes of an academic year (structure.manage), written through RLS with the
// caller's session. The database keeps year, level and filière in the
// caller's school (composite foreign keys). Error keys: `setup.errors`.

type ClassField = keyof ClassFormValues;
type BatchField = keyof ClassBatchFormValues;

const CLASS_CONSTRAINTS = {
  classes_name_key: "classNameTaken",
  classes_track_fkey: "invalidTrack", // filière of another level
  classes_level_fkey: "notFound",
  classes_academic_year_fkey: "notFound",
};

const FIELD_OF: Record<string, ClassField> = { classNameTaken: "name", invalidTrack: "trackId" };

function failure<F extends string>(key: string, fieldOf: Record<string, F>): { ok: false; error: string; field?: F } {
  return { ok: false, error: key, field: fieldOf[key] };
}

export async function createClass(
  academicYearId: unknown,
  input: unknown,
): Promise<StructureActionResult<{ id: string }, ClassField>> {
  const actor = await getSchoolActor("structure.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const year = structureIdSchema.safeParse(academicYearId);
  if (!year.success) return { ok: false, error: "notFound" };
  const v = parseInput<typeof classSchema, ClassField>(classSchema, input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const { data, error } = await (await createClient())
    .from("classes")
    .insert({
      school_id: actor.schoolId,
      academic_year_id: year.data,
      level_id: v.values.levelId,
      track_id: v.values.trackId || null,
      name: v.values.name,
    })
    .select("id")
    .single();
  if (error) return failure(dbErrorKey(error, CLASS_CONSTRAINTS), FIELD_OF);

  await auditStructure(actor, "class.create", "class", data.id, { name: v.values.name, academic_year_id: year.data });
  return { ok: true, data: { id: data.id } };
}

/** "<prefix>-A", "<prefix>-B", …: the next free letters of the year, all or nothing. */
export async function createClasses(
  academicYearId: unknown,
  input: unknown,
): Promise<StructureActionResult<{ names: string[] }, BatchField>> {
  const actor = await getSchoolActor("structure.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const year = structureIdSchema.safeParse(academicYearId);
  if (!year.success) return { ok: false, error: "notFound" };
  const v = parseInput<typeof classBatchSchema, BatchField>(classBatchSchema, input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("classes")
    .select("name")
    .eq("school_id", actor.schoolId)
    .eq("academic_year_id", year.data);
  if (readError) return { ok: false, error: "generic" };
  const names = suggestClassNames(v.values.prefix, existing.map((c) => c.name), v.values.count);
  if (!names || names.some((name) => name.length > 30)) return { ok: false, error: "tooManyClasses", field: "count" };

  // One INSERT: either every class is created or none.
  const { error } = await supabase.from("classes").insert(
    names.map((name) => ({
      school_id: actor.schoolId,
      academic_year_id: year.data,
      level_id: v.values.levelId,
      track_id: v.values.trackId || null,
      name,
    })),
  );
  // A name taken meanwhile (another tab): just retry.
  if (error) return failure(dbErrorKey(error, CLASS_CONSTRAINTS), { invalidTrack: "trackId" as const });

  await auditStructure(actor, "class.create_many", "academic_year", year.data, { names: names.join(", ") });
  return { ok: true, data: { names } };
}

/** Name, level and filière; a class stays in its academic year. */
export async function updateClass(classId: unknown, input: unknown): Promise<StructureActionResult<null, ClassField>> {
  const actor = await getSchoolActor("structure.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = structureIdSchema.safeParse(classId);
  if (!id.success) return { ok: false, error: "notFound" };
  const v = parseInput<typeof classSchema, ClassField>(classSchema, input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const { data, error } = await (await createClient())
    .from("classes")
    .update({ name: v.values.name, level_id: v.values.levelId, track_id: v.values.trackId || null })
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .select("id");
  if (error) return failure(dbErrorKey(error, CLASS_CONSTRAINTS), FIELD_OF);
  if (data.length === 0) return { ok: false, error: "notFound" };

  await auditStructure(actor, "class.update", "class", id.data, { name: v.values.name });
  return { ok: true, data: null };
}

export async function deleteClass(classId: unknown): Promise<StructureActionResult<null>> {
  const actor = await getSchoolActor("structure.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = structureIdSchema.safeParse(classId);
  if (!id.success) return { ok: false, error: "notFound" };

  const { data, error } = await (await createClient())
    .from("classes")
    .delete()
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .select("name");
  if (error) return { ok: false, error: dbErrorKey(error) };
  if (data.length === 0) return { ok: false, error: "notFound" };

  await auditStructure(actor, "class.delete", "class", id.data, { name: data[0].name });
  return { ok: true, data: null };
}
