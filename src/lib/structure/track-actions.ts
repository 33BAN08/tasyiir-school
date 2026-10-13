"use server";

import { getSchoolActor } from "@/lib/auth/school-actor";
import { auditStructure, parseInput, type StructureActionResult } from "@/lib/structure/action-utils";
import { dbErrorKey } from "@/lib/structure/db-errors";
import { createClient } from "@/lib/supabase/server";
import { structureIdSchema, trackSchema, type TrackFormValues } from "@/lib/validations/structure";

// Filières of a level (structure.manage), written through RLS with the
// caller's session. Error keys: `setup.errors`.

type TrackField = keyof TrackFormValues;

const TRACK_CONSTRAINTS = { tracks_name_key: "trackNameTaken" };

function failure(key: string): { ok: false; error: string; field?: TrackField } {
  return { ok: false, error: key, field: key === "trackNameTaken" ? "name" : undefined };
}

export async function createTrack(
  levelId: unknown,
  input: unknown,
): Promise<StructureActionResult<{ id: string }, TrackField>> {
  const actor = await getSchoolActor("structure.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = structureIdSchema.safeParse(levelId);
  if (!id.success) return { ok: false, error: "notFound" };
  const v = parseInput<typeof trackSchema, TrackField>(trackSchema, input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const supabase = await createClient();
  const { data: level } = await supabase
    .from("levels")
    .select("id, tracks(sort_order)")
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .maybeSingle();
  if (!level) return { ok: false, error: "notFound" };
  const last = Math.max(0, ...level.tracks.map((t) => t.sort_order));

  const { data, error } = await supabase
    .from("tracks")
    .insert({ school_id: actor.schoolId, level_id: level.id, name: v.values.name, sort_order: last + 10 })
    .select("id")
    .single();
  if (error) return failure(dbErrorKey(error, TRACK_CONSTRAINTS));

  await auditStructure(actor, "track.create", "track", data.id, { name: v.values.name, level_id: level.id });
  return { ok: true, data: { id: data.id } };
}

export async function renameTrack(trackId: unknown, input: unknown): Promise<StructureActionResult<null, TrackField>> {
  const actor = await getSchoolActor("structure.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = structureIdSchema.safeParse(trackId);
  if (!id.success) return { ok: false, error: "notFound" };
  const v = parseInput<typeof trackSchema, TrackField>(trackSchema, input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const { data, error } = await (await createClient())
    .from("tracks")
    .update({ name: v.values.name })
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .select("id");
  if (error) return failure(dbErrorKey(error, TRACK_CONSTRAINTS));
  if (data.length === 0) return { ok: false, error: "notFound" };

  await auditStructure(actor, "track.rename", "track", id.data, { name: v.values.name });
  return { ok: true, data: null };
}

export async function deleteTrack(trackId: unknown): Promise<StructureActionResult<null>> {
  const actor = await getSchoolActor("structure.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = structureIdSchema.safeParse(trackId);
  if (!id.success) return { ok: false, error: "notFound" };

  const { data, error } = await (await createClient())
    .from("tracks")
    .delete()
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .select("name");
  if (error) return { ok: false, error: dbErrorKey(error, { classes_track_fkey: "trackHasClasses" }) };
  if (data.length === 0) return { ok: false, error: "notFound" };

  await auditStructure(actor, "track.delete", "track", id.data, { name: data[0].name });
  return { ok: true, data: null };
}
