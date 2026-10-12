import "server-only";

import type { StaffTarget } from "@/lib/staff/rules";
import { createAdminClient } from "@/lib/supabase/admin";

// Secret-key reads for the staff Server Actions. Every query is filtered on the
// caller's school: an id from another school is simply "not found".

export type LoadedStaffTarget = StaffTarget & { fullName: string; roleId: string; email: string | null };

export async function loadStaffTarget(schoolId: string, id: string): Promise<LoadedStaffTarget | null> {
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id, full_name, email, role_id, deactivated_at, role:roles!inner(key, role_permissions(permission_key))")
    .eq("id", id)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (!data) return null;

  return {
    id: data.id,
    fullName: data.full_name,
    email: data.email,
    roleId: data.role_id,
    roleKey: data.role.key,
    permissions: data.role.role_permissions.map((p) => p.permission_key),
    deactivated: data.deactivated_at !== null,
  };
}

/** Active (not deactivated) directors of the school, other than `excludeId`. */
export async function countOtherActiveDirectors(schoolId: string, excludeId: string): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("profiles")
    .select("id, role:roles!inner(key)", { count: "exact", head: true })
    .eq("school_id", schoolId)
    .eq("role.key", "director")
    .is("deactivated_at", null)
    .neq("id", excludeId);
  if (error) throw new Error(`countOtherActiveDirectors failed: ${error.code}`);
  return count ?? 0;
}
