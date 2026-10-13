"use server";

import { getSchoolActor } from "@/lib/auth/school-actor";
import { auditStructure, parseInput, type StructureActionResult } from "@/lib/structure/action-utils";
import { dbErrorKey } from "@/lib/structure/db-errors";
import { createClient } from "@/lib/supabase/server";
import {
  levelSchema,
  moveDirectionSchema,
  structureIdSchema,
  type LevelFormValues,
} from "@/lib/validations/structure";

// Levels (structure.manage), written through RLS with the caller's session.
// Error keys: `setup.errors`.

type LevelField = keyof LevelFormValues;

const LEVEL_CONSTRAINTS = { levels_name_key: "levelNameTaken" };
// Its filières are deleted with it, so a class of one of them blocks it too.
const LEVEL_IN_USE = { classes_level_fkey: "levelHasClasses", classes_track_fkey: "levelHasClasses" };

function failure(key: string): { ok: false; error: string; field?: LevelField } {
  return { ok: false, error: key, field: key === "levelNameTaken" ? "name" : undefined };
}

/** Next display position at the end of a cycle. */
async function nextSortOrder(schoolId: string, cycle: string): Promise<number> {
  const { data } = await (await createClient())
    .from("levels")
    .select("sort_order")
    .eq("school_id", schoolId)
    .eq("cycle", cycle)
    .order("sort_order", { ascending: false })
    .limit(1);
  return (data?.[0]?.sort_order ?? 0) + 10;
}

export async function createLevel(input: unknown): Promise<StructureActionResult<{ id: string }, LevelField>> {
  const actor = await getSchoolActor("structure.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const v = parseInput<typeof levelSchema, LevelField>(levelSchema, input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const { data, error } = await (await createClient())
    .from("levels")
    .insert({
      school_id: actor.schoolId,
      cycle: v.values.cycle,
      name: v.values.name,
      sort_order: await nextSortOrder(actor.schoolId, v.values.cycle),
    })
    .select("id")
    .single();
  if (error) return failure(dbErrorKey(error, LEVEL_CONSTRAINTS));

  await auditStructure(actor, "level.create", "level", data.id, { name: v.values.name, cycle: v.values.cycle });
  return { ok: true, data: { id: data.id } };
}

export async function updateLevel(levelId: unknown, input: unknown): Promise<StructureActionResult<null, LevelField>> {
  const actor = await getSchoolActor("structure.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = structureIdSchema.safeParse(levelId);
  if (!id.success) return { ok: false, error: "notFound" };
  const v = parseInput<typeof levelSchema, LevelField>(levelSchema, input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const supabase = await createClient();
  const { data: level } = await supabase
    .from("levels")
    .select("cycle")
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .maybeSingle();
  if (!level) return { ok: false, error: "notFound" };

  // Moved to another cycle: goes to the end of it.
  const sortOrder = level.cycle === v.values.cycle ? undefined : await nextSortOrder(actor.schoolId, v.values.cycle);
  const { data, error } = await supabase
    .from("levels")
    .update({ name: v.values.name, cycle: v.values.cycle, ...(sortOrder ? { sort_order: sortOrder } : {}) })
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .select("id");
  if (error) return failure(dbErrorKey(error, LEVEL_CONSTRAINTS));
  if (data.length === 0) return { ok: false, error: "notFound" };

  await auditStructure(actor, "level.update", "level", id.data, { name: v.values.name, cycle: v.values.cycle });
  return { ok: true, data: null };
}

/** One place up or down within its cycle; the cycle is renumbered 10, 20, 30, … */
export async function moveLevel(levelId: unknown, direction: unknown): Promise<StructureActionResult<null>> {
  const actor = await getSchoolActor("structure.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = structureIdSchema.safeParse(levelId);
  const dir = moveDirectionSchema.safeParse(direction);
  if (!id.success || !dir.success) return { ok: false, error: "notFound" };

  const supabase = await createClient();
  const { data: level } = await supabase
    .from("levels")
    .select("cycle")
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .maybeSingle();
  if (!level) return { ok: false, error: "notFound" };

  const { data: siblings, error: readError } = await supabase
    .from("levels")
    .select("id, name, sort_order")
    .eq("school_id", actor.schoolId)
    .eq("cycle", level.cycle);
  if (readError) return { ok: false, error: "generic" };
  const ordered = siblings.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const from = ordered.findIndex((l) => l.id === id.data);
  const to = dir.data === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= ordered.length) return { ok: true, data: null }; // already first / last
  [ordered[from], ordered[to]] = [ordered[to], ordered[from]];

  const changes = ordered
    .map((l, i) => ({ id: l.id, sort_order: (i + 1) * 10, before: l.sort_order }))
    .filter((l) => l.sort_order !== l.before);
  const results = await Promise.all(
    changes.map((l) =>
      supabase.from("levels").update({ sort_order: l.sort_order }).eq("id", l.id).eq("school_id", actor.schoolId),
    ),
  );
  if (results.some((r) => r.error)) return { ok: false, error: "generic" };
  return { ok: true, data: null };
}

/** Its filières go with it; a level that still has classes cannot be deleted. */
export async function deleteLevel(levelId: unknown): Promise<StructureActionResult<null>> {
  const actor = await getSchoolActor("structure.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = structureIdSchema.safeParse(levelId);
  if (!id.success) return { ok: false, error: "notFound" };

  const { data, error } = await (await createClient())
    .from("levels")
    .delete()
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .select("name");
  if (error) return { ok: false, error: dbErrorKey(error, LEVEL_IN_USE) };
  if (data.length === 0) return { ok: false, error: "notFound" };

  await auditStructure(actor, "level.delete", "level", id.data, { name: data[0].name });
  return { ok: true, data: null };
}
