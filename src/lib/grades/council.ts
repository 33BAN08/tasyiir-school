import "server-only";

import { createClient } from "@/lib/supabase/server";

// Class-council remarks (grades.view / grades.manage read them through RLS).

export type CouncilRemark = { studentId: string; body: string; updatedAt: string };

/** The remarks of a class for a semester (`periodId` null = the year), by student. */
export async function listCouncilRemarks(classId: string, periodId: string | null): Promise<Map<string, CouncilRemark>> {
  let query = (await createClient()).from("council_remarks").select("student_id, body, updated_at").eq("class_id", classId);
  query = periodId ? query.eq("period_id", periodId) : query.is("period_id", null);
  const { data, error } = await query;
  if (error) throw new Error("listCouncilRemarks failed");
  return new Map(data.map((r) => [r.student_id, { studentId: r.student_id, body: r.body, updatedAt: r.updated_at }]));
}

export type CouncilStudent = { id: string; firstName: string; lastName: string; firstNameAr: string | null; lastNameAr: string | null };

/** The students of a class for its year, "NOM Prénom" order. */
export async function listClassStudents(schoolId: string, classId: string, yearId: string): Promise<CouncilStudent[]> {
  const { data, error } = await (await createClient())
    .from("student_enrollments")
    .select("student:students(id, first_name, last_name, first_name_ar, last_name_ar)")
    .eq("school_id", schoolId)
    .eq("class_id", classId)
    .eq("academic_year_id", yearId);
  if (error) throw new Error("listClassStudents failed");
  return data
    .flatMap((e) => (e.student ? [e.student] : []))
    .map((s) => ({ id: s.id, firstName: s.first_name, lastName: s.last_name, firstNameAr: s.first_name_ar, lastNameAr: s.last_name_ar }))
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
}
