import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export type SchoolUsage = {
  students: number;
  maxStudents: number | null;
  admins: number;
  maxAdmins: number | null;
};

/** What the signed-in user's school uses and its plan allows (null max = no limit). The database enforces it. */
export const getSchoolUsage = cache(async (): Promise<SchoolUsage | null> => {
  const { data } = await (await createClient()).rpc("school_usage");
  const row = data?.[0];
  if (!row) return null;
  return { students: row.students, maxStudents: row.max_students, admins: row.admins, maxAdmins: row.max_admins };
});

export const atLimit = (used: number, max: number | null) => max !== null && used >= max;
