import "server-only";

import type { RoomType } from "@/lib/structure/room-types";
import { byName } from "@/lib/structure/subjects";
import { createClient } from "@/lib/supabase/server";

// Reads for the rooms page, through RLS (own school only); the explicit
// school filter is a second fence.

export type Room = { id: string; name: string; capacity: number; roomType: RoomType | null };

export async function listRooms(schoolId: string): Promise<Room[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rooms")
    .select("id, name, capacity, room_type")
    .eq("school_id", schoolId);
  if (error) throw new Error("listRooms failed");
  return data
    .map((row) => ({ id: row.id, name: row.name, capacity: row.capacity, roomType: row.room_type as RoomType | null }))
    .sort(byName);
}
