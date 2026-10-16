import "server-only";

import { fetchPage, pageRange, type Page } from "@/lib/pagination";
import type { StudentNames } from "@/lib/students/names";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { GUARDIAN_PAGE_SIZE, type GuardianListParams, type Relation } from "@/lib/validations/parents";

// Guardian reads, through RLS (own school + students.view / parents.manage;
// a parent only sees their own row). The explicit school filter is a second fence.

export type AccountStatus = "none" | "pending" | "active" | "deactivated";

export type GuardianChild = StudentNames & { studentId: string; relation: Relation };

export type Guardian = {
  id: string;
  lastName: string;
  firstName: string;
  phone: string;
  email: string | null;
  profileId: string | null;
  account: AccountStatus;
  children: GuardianChild[];
};

const COLUMNS =
  "id, last_name, first_name, phone, email, profile_id, links:student_guardians(relation, student:students(id, first_name, last_name, first_name_ar, last_name_ar))";

type Row = {
  id: string;
  last_name: string;
  first_name: string;
  phone: string;
  email: string | null;
  profile_id: string | null;
  links: {
    relation: string;
    student: { id: string; first_name: string; last_name: string; first_name_ar: string | null; last_name_ar: string | null } | null;
  }[];
};

/**
 * Account status of these parent accounts. Read with the secret key (two
 * account flags only), for accounts of guardians the caller already read
 * through RLS: staff with parents.manage need not hold users.view.
 */
async function accountStatuses(schoolId: string, profileIds: string[]): Promise<Map<string, AccountStatus>> {
  if (profileIds.length === 0) return new Map();
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id, must_change_password, deactivated_at")
    .eq("school_id", schoolId)
    .in("id", profileIds);
  return new Map(
    (data ?? []).map((p) => [p.id, p.deactivated_at ? "deactivated" : p.must_change_password ? "pending" : "active"]),
  );
}

function toGuardian(row: Row, statuses: Map<string, AccountStatus>): Guardian {
  return {
    id: row.id,
    lastName: row.last_name,
    firstName: row.first_name,
    phone: row.phone,
    email: row.email,
    profileId: row.profile_id,
    account: row.profile_id ? (statuses.get(row.profile_id) ?? "none") : "none",
    children: row.links
      .filter((l) => l.student)
      .map((l) => ({
        studentId: l.student!.id,
        relation: l.relation as Relation,
        firstName: l.student!.first_name,
        lastName: l.student!.last_name,
        firstNameAr: l.student!.first_name_ar,
        lastNameAr: l.student!.last_name_ar,
      })),
  };
}

/** "06 12…" / "0612…" searches the phone; anything else the names. */
export function guardianSearchFilter(term: string): string | null {
  const clean = term.replace(/[,()"\\%_*]/g, " ").trim();
  if (!clean) return null;
  const digits = clean.replace(/[\s.\-+]/g, "");
  if (/^\d{3,}$/.test(digits)) {
    // Stored as +2126…: a typed leading 0 or 212 is dropped.
    const core = digits.replace(/^(00212|212|0)/, "");
    return `phone.ilike."%${core}%"`;
  }
  return ["last_name", "first_name"].map((c) => `${c}.ilike."%${clean}%"`).join(",");
}

export async function listGuardians(
  schoolId: string,
  { q, page }: GuardianListParams,
  pageSize = GUARDIAN_PAGE_SIZE,
): Promise<Omit<Page<Guardian>, "rows"> & { items: Guardian[] }> {
  const supabase = await createClient();
  const terms = q.split(/\s+(?=\D)/).filter(Boolean).slice(0, 4);

  const run = (p: number) => {
    let query = supabase
      .from("guardians")
      .select(COLUMNS, { count: "exact" })
      .eq("school_id", schoolId)
      .order("last_name")
      .order("first_name")
      .order("id")
      .range(...pageRange(p, pageSize));
    for (const term of terms) {
      const filter = guardianSearchFilter(term);
      if (filter) query = query.or(filter);
    }
    return query.overrideTypes<Row[], { merge: false }>();
  };

  const { rows, ...paging } = await fetchPage(run, page, pageSize, "listGuardians");
  const statuses = await accountStatuses(
    schoolId,
    rows.map((r) => r.profile_id).filter((id): id is string => Boolean(id)),
  );
  return { items: rows.map((r) => toGuardian(r, statuses)), ...paging };
}

export async function getGuardian(schoolId: string, guardianId: string): Promise<Guardian | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("guardians")
    .select(COLUMNS)
    .eq("school_id", schoolId)
    .eq("id", guardianId)
    .overrideTypes<Row[], { merge: false }>();
  if (error) throw new Error("getGuardian failed");
  const row = data[0];
  if (!row) return null;
  const statuses = await accountStatuses(schoolId, row.profile_id ? [row.profile_id] : []);
  return toGuardian(row, statuses);
}

/** A guardian as seen from one student's page. */
export type StudentGuardian = {
  id: string;
  lastName: string;
  firstName: string;
  phone: string;
  relation: Relation;
  account: AccountStatus;
};

const RELATION_ORDER: Record<Relation, number> = { father: 0, mother: 1, tutor: 2 };

/** The guardians of one student: father, mother, then tuteurs. */
export async function listStudentGuardians(schoolId: string, studentId: string): Promise<StudentGuardian[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("student_guardians")
    .select("relation, guardian:guardians(id, last_name, first_name, phone, profile_id)")
    .eq("school_id", schoolId)
    .eq("student_id", studentId);
  if (error) throw new Error("listStudentGuardians failed");

  const rows = data.filter((r) => r.guardian);
  const statuses = await accountStatuses(
    schoolId,
    rows.map((r) => r.guardian!.profile_id).filter((id): id is string => Boolean(id)),
  );
  return rows
    .map((r) => ({
      id: r.guardian!.id,
      lastName: r.guardian!.last_name,
      firstName: r.guardian!.first_name,
      phone: r.guardian!.phone,
      relation: r.relation as Relation,
      account: r.guardian!.profile_id ? (statuses.get(r.guardian!.profile_id) ?? "none") : "none",
    }))
    .sort(
      (a, b) =>
        RELATION_ORDER[a.relation] - RELATION_ORDER[b.relation] ||
        a.lastName.localeCompare(b.lastName) ||
        a.firstName.localeCompare(b.firstName),
    );
}
