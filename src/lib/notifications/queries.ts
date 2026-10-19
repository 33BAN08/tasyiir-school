import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { NotificationData, NotificationItem, NotificationType } from "./types";

// Read with the signed-in user's own session: RLS returns only their own
// notifications, in their school.

/** The newest notifications shown on the list page. */
export const LIST_LIMIT = 50;

export async function listNotifications(): Promise<NotificationItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select(
      "id, type, student_id, data, created_at, read_at, student:students(first_name, last_name, first_name_ar, last_name_ar)",
    )
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) throw new Error(error.message);

  return data.map((row) => ({
    id: row.id,
    type: row.type as NotificationType,
    studentId: row.student_id,
    student: row.student
      ? {
          firstName: row.student.first_name,
          lastName: row.student.last_name,
          firstNameAr: row.student.first_name_ar,
          lastNameAr: row.student.last_name_ar,
        }
      : null,
    data: (row.data ?? {}) as NotificationData,
    createdAt: row.created_at,
    readAt: row.read_at,
  }));
}

export async function countUnread(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  return count ?? 0;
}
