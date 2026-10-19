import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { DemoStudentRange } from "@/lib/validations/demo-request";

/** The newest requests shown on /platform/demo-requests. */
export const DEMO_LIST_LIMIT = 100;

export type DemoRequestItem = {
  id: string;
  fullName: string;
  schoolName: string;
  city: string;
  phone: string;
  email: string | null;
  students: DemoStudentRange;
  message: string | null;
  createdAt: string;
  handledAt: string | null;
};

/** Read with the platform owner's own session: RLS returns rows to the platform owner only. */
export async function listDemoRequests(): Promise<DemoRequestItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("demo_requests")
    .select("id, full_name, school_name, city, phone, email, students, message, created_at, handled_at")
    .order("created_at", { ascending: false })
    .limit(DEMO_LIST_LIMIT);
  if (error) throw new Error(error.message);

  return data.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    schoolName: row.school_name,
    city: row.city,
    phone: row.phone,
    email: row.email,
    students: row.students as DemoStudentRange,
    message: row.message,
    createdAt: row.created_at,
    handledAt: row.handled_at,
  }));
}
