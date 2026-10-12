import "server-only";

import { fetchPage, pageRange, type Page } from "@/lib/pagination";
import { ilikeAny } from "@/lib/search";
import { NON_STAFF_ROLE_KEYS, roleAssignmentError, type StaffActor } from "@/lib/staff/rules";
import { createClient } from "@/lib/supabase/server";
import {
  STAFF_PAGE_SIZE,
  type StaffListParams,
  type StaffStatus,
} from "@/lib/validations/staff";

// Director reads. They go through RLS (profiles: users.view, own school only);
// the explicit school filter is a second fence. Callers must have checked
// requireSchoolPermission("users.view") first.

export type StaffRole = { id: string; key: string; name: string };

export type StaffMember = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: StaffRole;
  status: StaffStatus;
  createdAt: string;
};

const NON_STAFF = `(${NON_STAFF_ROLE_KEYS.join(",")})`;

const LIST_COLUMNS =
  "id, full_name, email, phone, must_change_password, deactivated_at, created_at, role:roles!inner(id, key, name)";

export async function listStaff(
  schoolId: string,
  { q, role, status, page }: StaffListParams,
  pageSize = STAFF_PAGE_SIZE,
): Promise<Omit<Page<StaffMember>, "rows"> & { items: StaffMember[] }> {
  const supabase = await createClient();
  const filter = ilikeAny(q, ["full_name", "email", "phone"]);

  const run = (p: number) => {
    let query = supabase
      .from("profiles")
      .select(LIST_COLUMNS, { count: "exact" })
      .eq("school_id", schoolId)
      .not("role.key", "in", NON_STAFF)
      .order("full_name")
      .order("id")
      .range(...pageRange(p, pageSize));
    if (role) query = query.eq("role_id", role);
    if (status === "deactivated") query = query.not("deactivated_at", "is", null);
    if (status === "active") query = query.is("deactivated_at", null).eq("must_change_password", false);
    if (status === "pending") query = query.is("deactivated_at", null).eq("must_change_password", true);
    if (filter) query = query.or(filter);
    return query;
  };

  const { rows, ...paging } = await fetchPage(run, page, pageSize, "listStaff");
  return { items: rows.map(toMember), ...paging };
}

type Row = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  must_change_password: boolean;
  deactivated_at: string | null;
  created_at: string;
  role: StaffRole;
};

function toMember(row: Row): StaffMember {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    status: row.deactivated_at ? "deactivated" : row.must_change_password ? "pending" : "active",
    createdAt: row.created_at,
  };
}

/** Roles a staff member can have in this school (built-in first, then custom), by name. */
export async function listStaffRoles(schoolId: string): Promise<StaffRole[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("roles")
    .select("id, key, name, is_system")
    .eq("school_id", schoolId)
    .not("key", "in", NON_STAFF)
    .order("is_system", { ascending: false })
    .order("name");
  if (error) throw new Error(`listStaffRoles failed: ${error.code}`);
  return data.map(({ id, key, name }) => ({ id, key, name }));
}

/**
 * Roles the actor may give to a staff account (same rule as the Server
 * Actions, which re-check it): offered in the create / edit forms.
 */
export async function listAssignableRoles(schoolId: string, actor: StaffActor): Promise<StaffRole[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("roles")
    .select("id, key, name, is_system, role_permissions(permission_key)")
    .eq("school_id", schoolId)
    .order("is_system", { ascending: false })
    .order("name");
  if (error) throw new Error(`listAssignableRoles failed: ${error.code}`);

  return data
    .filter(
      (role) =>
        roleAssignmentError(actor, {
          key: role.key,
          permissions: role.role_permissions.map((p) => p.permission_key),
        }) === null,
    )
    .map(({ id, key, name }) => ({ id, key, name }));
}

export type StaffMemberDetail = StaffMember & {
  locale: string;
  rolePermissions: string[];
  deactivatedAt: string | null;
  /** Active directors of the school other than this member (for the last-director rule). */
  otherActiveDirectors: number;
};

/** One staff account of the school (null if missing, another school's, or a family account). */
export async function getStaffMember(schoolId: string, id: string): Promise<StaffMemberDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, phone, locale, must_change_password, deactivated_at, created_at, role:roles!inner(id, key, name, role_permissions(permission_key))",
    )
    .eq("id", id)
    .eq("school_id", schoolId)
    .not("role.key", "in", NON_STAFF)
    .maybeSingle();
  if (error) throw new Error(`getStaffMember failed: ${error.code}`);
  if (!data) return null;

  const { count, error: countError } = await supabase
    .from("profiles")
    .select("id, role:roles!inner(key)", { count: "exact", head: true })
    .eq("school_id", schoolId)
    .eq("role.key", "director")
    .is("deactivated_at", null)
    .neq("id", id);
  if (countError) throw new Error(`getStaffMember count failed: ${countError.code}`);

  const { role_permissions, ...role } = data.role;
  return {
    ...toMember({ ...data, role }),
    locale: data.locale,
    rolePermissions: role_permissions.map((p) => p.permission_key),
    deactivatedAt: data.deactivated_at,
    otherActiveDirectors: count ?? 0,
  };
}
