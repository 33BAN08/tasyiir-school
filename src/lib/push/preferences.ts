import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Which kinds of notification reach the parent's phones (Phase 10 step 5). No row = all on. */
export type PushPreferences = { absences: boolean; remarks: boolean; announcements: boolean; grades: boolean };

export const ALL_ON: PushPreferences = { absences: true, remarks: true, announcements: true, grades: true };

/** The signed-in parent's switches (RLS: own row only). */
export async function getPushPreferences(): Promise<PushPreferences> {
  const supabase = await createClient();
  const { data } = await supabase.from("push_preferences").select("absences, remarks, announcements, grades").maybeSingle();
  return data ?? ALL_ON;
}
