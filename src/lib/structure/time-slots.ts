import "server-only";

import { shortTime, type SchoolDay, type SlotKind } from "@/lib/structure/time-slot-template";
import { createClient } from "@/lib/supabase/server";

// Reads for the time slots page, through RLS (own school only); the explicit
// school filter is a second fence.

export type TimeSlot = {
  id: string;
  day: SchoolDay;
  /** "HH:MM" */
  startTime: string;
  endTime: string;
  kind: SlotKind;
  label: string | null;
};

export type SchoolWeek = { days: SchoolDay[]; slots: TimeSlot[] };

/** School days and slots of one academic year, in day then time order. */
export async function getSchoolWeek(schoolId: string, academicYearId: string): Promise<SchoolWeek> {
  const supabase = await createClient();
  const [days, slots] = await Promise.all([
    supabase
      .from("school_days")
      .select("day_of_week")
      .eq("school_id", schoolId)
      .eq("academic_year_id", academicYearId)
      .order("day_of_week"),
    supabase
      .from("time_slots")
      .select("id, day_of_week, start_time, end_time, kind, label")
      .eq("school_id", schoolId)
      .eq("academic_year_id", academicYearId)
      .order("day_of_week")
      .order("start_time"),
  ]);
  if (days.error || slots.error) throw new Error("getSchoolWeek failed");

  return {
    days: days.data.map((row) => row.day_of_week as SchoolDay),
    slots: slots.data.map((row) => ({
      id: row.id,
      day: row.day_of_week as SchoolDay,
      startTime: shortTime(row.start_time),
      endTime: shortTime(row.end_time),
      kind: row.kind as SlotKind,
      label: row.label,
    })),
  };
}

/** Number of slots of each academic year that has some (for "copy from another year"). */
export async function countSlotsByYear(schoolId: string): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("time_slots").select("academic_year_id").eq("school_id", schoolId);
  if (error) throw new Error("countSlotsByYear failed");
  const counts: Record<string, number> = {};
  for (const row of data) counts[row.academic_year_id] = (counts[row.academic_year_id] ?? 0) + 1;
  return counts;
}
