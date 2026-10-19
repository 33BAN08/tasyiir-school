import "server-only";

import { compareClassNames } from "@/lib/structure/class-names";
import type { StudentNames } from "@/lib/students/names";
import { getCurrentYear } from "@/lib/students/students";
import { createClient } from "@/lib/supabase/server";
import { REMARK_EDIT_HOURS, type RemarkType } from "@/lib/validations/remarks";

// Remark reads, through the signed-in user's own session: RLS returns the
// author's own, every remark of the school for the director / attendance.manage,
// this year's remarks of their students for a teacher, a parent's own children's.

export type Remark = {
  id: string;
  studentId: string;
  student: StudentNames | null;
  type: RemarkType;
  body: string;
  createdAt: string;
  updatedAt: string | null;
  readAt: string | null;
  createdBy: string | null;
  /** Shown when the reader may read the author's profile (the director); null otherwise. */
  authorName: string | null;
  /** The author's 24 hours to change or delete it have not passed. */
  editable: boolean;
};

/** The newest remarks shown in a list. */
export const REMARK_LIMIT = 100;

const COLUMNS =
  "id, student_id, type, body, created_at, updated_at, read_at, created_by, author:profiles!student_remarks_author_fkey(full_name), student:students(first_name, last_name, first_name_ar, last_name_ar)";

type Row = {
  id: string;
  student_id: string;
  type: string;
  body: string;
  created_at: string;
  updated_at: string | null;
  read_at: string | null;
  created_by: string | null;
  author: { full_name: string } | null;
  student: { first_name: string; last_name: string; first_name_ar: string | null; last_name_ar: string | null } | null;
};

function toRemark(row: Row, now: number): Remark {
  return {
    id: row.id,
    studentId: row.student_id,
    student: row.student
      ? {
          firstName: row.student.first_name,
          lastName: row.student.last_name,
          firstNameAr: row.student.first_name_ar,
          lastNameAr: row.student.last_name_ar,
        }
      : null,
    type: row.type as RemarkType,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    readAt: row.read_at,
    createdBy: row.created_by,
    authorName: row.author?.full_name ?? null,
    // Compared in UTC: no time zone involved. The database checks the same rule.
    editable: now - Date.parse(row.created_at) < REMARK_EDIT_HOURS * 3_600_000,
  };
}

/** One student's remarks, newest first (RLS decides which). */
export async function listStudentRemarks(studentId: string): Promise<Remark[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("student_remarks")
    .select(COLUMNS)
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(REMARK_LIMIT);
  if (error) throw new Error("listStudentRemarks failed");
  const now = Date.now();
  return data.map((row) => toRemark(row, now));
}

/** The remarks of the students of one class this year, newest first. */
export async function listClassRemarks(studentIds: string[]): Promise<Remark[]> {
  if (studentIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("student_remarks")
    .select(COLUMNS)
    .in("student_id", studentIds)
    .order("created_at", { ascending: false })
    .limit(REMARK_LIMIT);
  if (error) throw new Error("listClassRemarks failed");
  const now = Date.now();
  return data.map((row) => toRemark(row, now));
}

export type RemarkClass = { id: string; name: string };
export type ClassStudent = StudentNames & { id: string; photoPath: string | null };

/**
 * Classes of the current year the user writes remarks for: every class for
 * attendance.manage / the director, the classes they teach for a teacher.
 */
export async function listRemarkClasses(
  user: { id: string; schoolId: string },
  isTeacher: boolean,
): Promise<{ yearId: string | null; classes: RemarkClass[] }> {
  const year = await getCurrentYear(user.schoolId);
  if (!year) return { yearId: null, classes: [] };
  const supabase = await createClient();
  let classes: RemarkClass[];
  if (isTeacher) {
    const { data, error } = await supabase
      .from("lessons")
      .select("class:classes(id, name)")
      .eq("school_id", user.schoolId)
      .eq("academic_year_id", year.id)
      .eq("teacher_id", user.id);
    if (error) throw new Error("listRemarkClasses failed");
    const byId = new Map<string, RemarkClass>();
    for (const l of data) if (l.class) byId.set(l.class.id, l.class);
    classes = [...byId.values()];
  } else {
    const { data, error } = await supabase
      .from("classes")
      .select("id, name")
      .eq("school_id", user.schoolId)
      .eq("academic_year_id", year.id);
    if (error) throw new Error("listRemarkClasses failed");
    classes = data;
  }
  return { yearId: year.id, classes: classes.sort((a, b) => compareClassNames(a.name, b.name)) };
}

/** The students of a class in a year, "NOM Prénom" order. */
export async function listClassStudents(schoolId: string, classId: string, yearId: string): Promise<ClassStudent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("student_enrollments")
    .select("student:students(id, first_name, last_name, first_name_ar, last_name_ar, photo_path)")
    .eq("school_id", schoolId)
    .eq("class_id", classId)
    .eq("academic_year_id", yearId);
  if (error) throw new Error("listClassStudents failed");
  return data
    .flatMap((e) => (e.student ? [e.student] : []))
    .map((s) => ({
      id: s.id,
      firstName: s.first_name,
      lastName: s.last_name,
      firstNameAr: s.first_name_ar,
      lastNameAr: s.last_name_ar,
      photoPath: s.photo_path,
    }))
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
}
