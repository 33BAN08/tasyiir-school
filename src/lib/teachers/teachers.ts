import "server-only";

import type { SubjectColor } from "@/lib/structure/subject-template";
import { byName, type Subject } from "@/lib/structure/subjects";
import { createClient } from "@/lib/supabase/server";
import type { StaffStatus } from "@/lib/validations/staff";

// Teacher reads, through RLS: teacher accounts (profiles_select_teachers with
// teachers.manage, or users.view) and their subjects (teacher_subjects). The
// explicit school filter is a second fence. Callers check teachers.manage first.

export type Teacher = {
  id: string;
  fullName: string;
  email: string | null;
  status: StaffStatus;
  subjects: Subject[];
};

type Row = {
  id: string;
  full_name: string;
  email: string | null;
  must_change_password: boolean;
  deactivated_at: string | null;
  subjects: { subject: { id: string; name: string; code: string | null; color: string } | null }[];
};

/** Every teacher-role account of the school, by name, with their subjects by name. */
export async function listTeachers(schoolId: string): Promise<Teacher[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, must_change_password, deactivated_at, role:roles!inner(key), subjects:teacher_subjects(subject:subjects(id, name, code, color))",
    )
    .eq("school_id", schoolId)
    .eq("role.key", "teacher")
    .order("full_name")
    .order("id")
    .overrideTypes<Row[], { merge: false }>();
  if (error) throw new Error("listTeachers failed");

  return data.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    status: row.deactivated_at ? "deactivated" : row.must_change_password ? "pending" : "active",
    subjects: row.subjects
      .map((s) => s.subject)
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .map((s) => ({ ...s, color: s.color as SubjectColor }))
      .sort(byName),
  }));
}
