import "server-only";

import type { StudentNames } from "@/lib/students/names";
import { createClient } from "@/lib/supabase/server";

// Staff reads (attendance.view / .manage read the whole school through RLS).

export const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** Most justifications shown at once (the newest ones of the chosen state). */
export const REVIEW_LIMIT = 100;

export type ReviewItem = StudentNames & {
  id: string;
  studentId: string;
  className: string | null;
  kind: "days" | "mark";
  status: ReviewStatus;
  fromDate: string;
  toDate: string;
  reason: string;
  hasFile: boolean;
  reviewNote: string | null;
};

type Row = {
  id: string;
  kind: string;
  status: string;
  from_date: string;
  to_date: string;
  reason: string;
  file_path: string | null;
  review_note: string | null;
  student: {
    id: string;
    first_name: string;
    last_name: string;
    first_name_ar: string | null;
    last_name_ar: string | null;
    enrollment: { academic_year_id: string; class: { name: string } | null }[];
  } | null;
};

/** The school's justifications in one state, with their students' classes of `yearId`: pending oldest first (to answer in order), the others newest first. */
export async function listJustifications(
  schoolId: string,
  yearId: string | null,
  status: ReviewStatus,
): Promise<{ items: ReviewItem[]; counts: Record<ReviewStatus, number> }> {
  const supabase = await createClient();
  const count = (s: ReviewStatus) =>
    supabase.from("justifications").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", s);
  const [list, pending, approved, rejected] = await Promise.all([
    supabase
      .from("justifications")
      .select(
        "id, kind, status, from_date, to_date, reason, file_path, review_note, " +
          "student:students(id, first_name, last_name, first_name_ar, last_name_ar, enrollment:student_enrollments(academic_year_id, class:classes(name)))",
      )
      .eq("school_id", schoolId)
      .eq("status", status)
      .order("submitted_at", { ascending: status === "pending" })
      .limit(REVIEW_LIMIT)
      .overrideTypes<Row[], { merge: false }>(),
    count("pending"),
    count("approved"),
    count("rejected"),
  ]);
  if (list.error) throw new Error("listJustifications failed");

  const items = list.data.flatMap((r): ReviewItem[] =>
    r.student
      ? [
          {
            id: r.id,
            studentId: r.student.id,
            firstName: r.student.first_name,
            lastName: r.student.last_name,
            firstNameAr: r.student.first_name_ar,
            lastNameAr: r.student.last_name_ar,
            className: r.student.enrollment.find((e) => e.academic_year_id === yearId)?.class?.name ?? null,
            kind: r.kind as ReviewItem["kind"],
            status: r.status as ReviewStatus,
            fromDate: r.from_date,
            toDate: r.to_date,
            reason: r.reason,
            hasFile: Boolean(r.file_path),
            reviewNote: r.review_note,
          },
        ]
      : [],
  );
  return { items, counts: { pending: pending.count ?? 0, approved: approved.count ?? 0, rejected: rejected.count ?? 0 } };
}
