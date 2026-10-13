import "server-only";

import { CYCLES, type Cycle } from "@/lib/structure/level-template";
import { createClient } from "@/lib/supabase/server";

// Reads for the levels page, through RLS (own school only); the explicit
// school filter is a second fence.

export type Track = { id: string; name: string; sortOrder: number };
export type Level = { id: string; cycle: Cycle; name: string; sortOrder: number; tracks: Track[] };
export type CycleGroup = { cycle: Cycle; levels: Level[] };

const byOrder = (a: { sortOrder: number; name: string }, b: { sortOrder: number; name: string }) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

/** Levels grouped by cycle (Préscolaire → Lycée → other), each in display order with its filières. */
export async function listLevelsByCycle(schoolId: string): Promise<CycleGroup[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("levels")
    .select("id, cycle, name, sort_order, tracks(id, name, sort_order)")
    .eq("school_id", schoolId);
  if (error) throw new Error("listLevelsByCycle failed");

  const levels: Level[] = data.map((row) => ({
    id: row.id,
    cycle: row.cycle as Cycle,
    name: row.name,
    sortOrder: row.sort_order,
    tracks: row.tracks.map((t) => ({ id: t.id, name: t.name, sortOrder: t.sort_order })).sort(byOrder),
  }));

  return CYCLES.map((cycle) => ({ cycle, levels: levels.filter((l) => l.cycle === cycle).sort(byOrder) })).filter(
    (group) => group.levels.length > 0,
  );
}
