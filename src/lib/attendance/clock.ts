import "server-only";

import { createClient } from "@/lib/supabase/server";

// The school's date and time come from the database (Africa/Casablanca with
// up-to-date time-zone data): Node here may still have Morocco at UTC+1.

export type SchoolClock = { date: string; time: string; weekday: number };

/** The school's local date ("yyyy-MM-dd"), time ("HH:MM") and weekday (1 = Monday … 7 = Sunday) of an instant (now by default). */
export async function schoolClock(at?: string): Promise<SchoolClock> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("school_clock", at ? { p_at: at } : {}).single();
  if (error || !data) throw new Error("schoolClock failed");
  return { date: data.local_date, time: data.local_time, weekday: data.weekday };
}

/** "HH:MM" at the school of an instant, or null. */
export async function schoolTime(at: string | null | undefined): Promise<string | null> {
  return at ? (await schoolClock(at)).time : null;
}
