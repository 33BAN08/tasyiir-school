"use server";

import { getSchoolActor } from "@/lib/auth/school-actor";
import { auditStructure, parseInput, type StructureActionResult } from "@/lib/structure/action-utils";
import { dbErrorKey } from "@/lib/structure/db-errors";
import { createClient } from "@/lib/supabase/server";
import { roomSchema, structureIdSchema, type RoomFormValues } from "@/lib/validations/structure";

// Rooms (structure.manage), written through RLS with the caller's session.
// Error keys: `setup.errors`.

type RoomField = keyof RoomFormValues;

const ROOM_CONSTRAINTS = { rooms_name_key: "roomNameTaken", rooms_capacity_check: "capacityRange" };
const FIELD_OF: Record<string, RoomField> = { roomNameTaken: "name", capacityRange: "capacity" };

function failure(key: string): { ok: false; error: string; field?: RoomField } {
  return { ok: false, error: key, field: FIELD_OF[key] };
}

export async function createRoom(input: unknown): Promise<StructureActionResult<{ id: string }, RoomField>> {
  const actor = await getSchoolActor("structure.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const v = parseInput<typeof roomSchema, RoomField>(roomSchema, input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const { data, error } = await (await createClient())
    .from("rooms")
    .insert({
      school_id: actor.schoolId,
      name: v.values.name,
      capacity: v.values.capacity,
      room_type: v.values.roomType || null,
    })
    .select("id")
    .single();
  if (error) return failure(dbErrorKey(error, ROOM_CONSTRAINTS));

  await auditStructure(actor, "room.create", "room", data.id, { name: v.values.name });
  return { ok: true, data: { id: data.id } };
}

export async function updateRoom(roomId: unknown, input: unknown): Promise<StructureActionResult<null, RoomField>> {
  const actor = await getSchoolActor("structure.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = structureIdSchema.safeParse(roomId);
  if (!id.success) return { ok: false, error: "notFound" };
  const v = parseInput<typeof roomSchema, RoomField>(roomSchema, input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const { data, error } = await (await createClient())
    .from("rooms")
    .update({ name: v.values.name, capacity: v.values.capacity, room_type: v.values.roomType || null })
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .select("id");
  if (error) return failure(dbErrorKey(error, ROOM_CONSTRAINTS));
  if (data.length === 0) return { ok: false, error: "notFound" };

  await auditStructure(actor, "room.update", "room", id.data, { name: v.values.name });
  return { ok: true, data: null };
}

export async function deleteRoom(roomId: unknown): Promise<StructureActionResult<null>> {
  const actor = await getSchoolActor("structure.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = structureIdSchema.safeParse(roomId);
  if (!id.success) return { ok: false, error: "notFound" };

  const { data, error } = await (await createClient())
    .from("rooms")
    .delete()
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .select("name");
  if (error) return { ok: false, error: dbErrorKey(error, { lessons_room_fkey: "roomHasLessons" }) };
  if (data.length === 0) return { ok: false, error: "notFound" };

  await auditStructure(actor, "room.delete", "room", id.data, { name: data[0].name });
  return { ok: true, data: null };
}
