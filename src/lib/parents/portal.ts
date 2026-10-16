import "server-only";

import type { StudentNames } from "@/lib/students/names";
import { getCurrentYear } from "@/lib/students/students";
import { createClient } from "@/lib/supabase/server";
import type { Relation } from "@/lib/validations/parents";

// The parent portal reads with the PARENT's own session: RLS returns only
// their linked children (private.is_linked_to_student) and their own links.

export type MyChild = StudentNames & {
  id: string;
  relation: Relation;
  photoPath: string | null;
  className: string | null;
};

type Row = {
  relation: string;
  student: {
    id: string;
    first_name: string;
    last_name: string;
    first_name_ar: string | null;
    last_name_ar: string | null;
    photo_path: string | null;
    enrollment: { academic_year_id: string; class: { name: string } | null }[];
  } | null;
};

export async function listMyChildren(schoolId: string): Promise<MyChild[]> {
  const supabase = await createClient();
  const year = await getCurrentYear(schoolId);
  const { data, error } = await supabase
    .from("student_guardians")
    .select(
      "relation, student:students(id, first_name, last_name, first_name_ar, last_name_ar, photo_path, enrollment:student_enrollments(academic_year_id, class:classes(name)))",
    )
    .eq("school_id", schoolId)
    .overrideTypes<Row[], { merge: false }>();
  if (error) throw new Error("listMyChildren failed");

  return data
    .filter((row) => row.student)
    .map((row) => {
      const s = row.student!;
      const current = s.enrollment.find((e) => e.academic_year_id === year?.id);
      return {
        id: s.id,
        firstName: s.first_name,
        lastName: s.last_name,
        firstNameAr: s.first_name_ar,
        lastNameAr: s.last_name_ar,
        photoPath: s.photo_path,
        relation: row.relation as Relation,
        className: current?.class?.name ?? null,
      };
    })
    .sort((a, b) => a.firstName.localeCompare(b.firstName));
}
