import "server-only";

import { fetchPage, pageRange, type Page } from "@/lib/pagination";
import { ilikeAny } from "@/lib/search";
import type { StudentNames } from "@/lib/students/names";
import { createClient } from "@/lib/supabase/server";
import { NO_CLASS, STUDENT_PAGE_SIZE, type Gender, type StudentListParams } from "@/lib/validations/students";

// Student reads, through RLS (own school + students.view / students.manage);
// the explicit school filter is a second fence. Callers check the permission first.

export type Student = StudentNames & {
  id: string;
  birthDate: string;
  gender: Gender;
  codeMassar: string | null;
  /** Class in the year the list was read for (null: none, or no current year). */
  classId: string | null;
  className: string | null;
};

const SEARCH_COLUMNS = ["last_name", "first_name", "last_name_ar", "first_name_ar", "code_massar"];
const MAX_SEARCH_TERMS = 4;

/** The school's current academic year, or null. */
export async function getCurrentYear(schoolId: string): Promise<{ id: string; label: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("academic_years")
    .select("id, label")
    .eq("school_id", schoolId)
    .eq("is_current", true)
    .maybeSingle();
  if (error) throw new Error("getCurrentYear failed");
  return data;
}

/**
 * Students in "NOM Prénom" order, with their class in `yearId`. Each search
 * word must match a name (Latin or Arabic) or the Massar code, so
 * "benali amine" finds "BENALI Amine". `class` = a class of that year, or
 * NO_CLASS for students without a class that year.
 */
export async function listStudents(
  schoolId: string,
  yearId: string | null,
  { q, class: classFilter, page }: StudentListParams,
  pageSize = STUDENT_PAGE_SIZE,
): Promise<Omit<Page<Student>, "rows"> & { items: Student[] }> {
  const supabase = await createClient();
  const terms = q.split(/\s+/).filter(Boolean).slice(0, MAX_SEARCH_TERMS);
  const byClass = yearId && classFilter && classFilter !== NO_CLASS ? classFilter : null;
  const withoutClass = Boolean(yearId) && classFilter === NO_CLASS;

  const enrollment = byClass ? "enrollment:student_enrollments!inner" : "enrollment:student_enrollments";
  const columns = `id, first_name, last_name, first_name_ar, last_name_ar, birth_date, gender, code_massar, ${enrollment}(class_id, academic_year_id, class:classes(name))`;

  const run = (p: number) => {
    let query = supabase
      .from("students")
      .select(columns, { count: "exact" })
      .eq("school_id", schoolId)
      // Only this year's class (other years are history).
      .eq("enrollment.academic_year_id", yearId ?? "00000000-0000-0000-0000-000000000000")
      .order("last_name")
      .order("first_name")
      .order("id")
      .range(...pageRange(p, pageSize));
    if (byClass) query = query.eq("enrollment.class_id", byClass);
    if (withoutClass) query = query.is("enrollment", null);
    for (const term of terms) {
      const filter = ilikeAny(term, SEARCH_COLUMNS);
      if (filter) query = query.or(filter);
    }
    // The select is built at run time, so its row type is declared here.
    return query.overrideTypes<Row[], { merge: false }>();
  };

  const { rows, ...paging } = await fetchPage(run, page, pageSize, "listStudents");
  return { items: rows.map(toStudent), ...paging };
}

type Row = {
  id: string;
  first_name: string;
  last_name: string;
  first_name_ar: string | null;
  last_name_ar: string | null;
  birth_date: string;
  gender: string;
  code_massar: string | null;
  enrollment: { class_id: string; class: { name: string } | null }[];
};

function toStudent(row: Row): Student {
  const current = row.enrollment[0];
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    firstNameAr: row.first_name_ar,
    lastNameAr: row.last_name_ar,
    birthDate: row.birth_date,
    gender: row.gender as Gender,
    codeMassar: row.code_massar,
    classId: current?.class_id ?? null,
    className: current?.class?.name ?? null,
  };
}

/** Number of students in the school (any class, any year). */
export async function countStudents(schoolId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("students")
    .select("id", { count: "exact", head: true })
    .eq("school_id", schoolId);
  if (error) throw new Error("countStudents failed");
  return count ?? 0;
}
