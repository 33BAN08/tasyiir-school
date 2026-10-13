import "server-only";

import { compareClassNames } from "@/lib/structure/class-names";
import { createClient } from "@/lib/supabase/server";

// Reads for the classes page, through RLS (own school only); the explicit
// school filter is a second fence.

export type SchoolClass = { id: string; name: string; levelId: string; trackId: string | null };

/** Classes of one academic year, in name order ("1AC-A", "1AC-B", …). */
export async function listClasses(schoolId: string, academicYearId: string): Promise<SchoolClass[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("classes")
    .select("id, name, level_id, track_id")
    .eq("school_id", schoolId)
    .eq("academic_year_id", academicYearId);
  if (error) throw new Error("listClasses failed");

  return data
    .map((row) => ({ id: row.id, name: row.name, levelId: row.level_id, trackId: row.track_id }))
    .sort((a, b) => compareClassNames(a.name, b.name));
}
