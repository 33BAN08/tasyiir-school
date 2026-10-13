import "server-only";

import { createClient } from "@/lib/supabase/server";

// Reads for the roles pages. They go through RLS (roles: own school; profiles:
// users.view); the explicit school filter is a second fence. Callers must have
// checked requireSchoolPermission("roles.manage") first.

/** Portal / platform roles are not managed on the staff pages. */
const NOT_MANAGED = "(platform_owner,parent,student)";

export type RoleOverview = {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
  permissions: string[];
  memberCount: number;
};

const COLUMNS = "id, key, name, is_system, role_permissions(permission_key), profiles(count)";

type Row = {
  id: string;
  key: string;
  name: string;
  is_system: boolean;
  role_permissions: { permission_key: string }[];
  profiles: { count: number }[];
};

function toOverview(row: Row): RoleOverview {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    isSystem: row.is_system,
    permissions: row.role_permissions.map((p) => p.permission_key).sort(),
    memberCount: row.profiles[0]?.count ?? 0,
  };
}

/** Staff roles of the school: built-in first, then custom ones by name. */
export async function listRoles(schoolId: string): Promise<RoleOverview[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("roles")
    .select(COLUMNS)
    .eq("school_id", schoolId)
    .not("key", "in", NOT_MANAGED)
    .order("is_system", { ascending: false })
    .order("name");
  if (error) throw new Error(`listRoles failed: ${error.code}`);
  return data.map(toOverview);
}

export async function getRole(schoolId: string, id: string): Promise<RoleOverview | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("roles")
    .select(COLUMNS)
    .eq("id", id)
    .eq("school_id", schoolId)
    .not("key", "in", NOT_MANAGED)
    .maybeSingle();
  if (error) throw new Error(`getRole failed: ${error.code}`);
  return data ? toOverview(data) : null;
}

export type PermissionGroup = { moduleKey: string | null; permissions: string[] };

/** Display order of permission keys: known areas first, and "view" before other actions. */
const AREA_ORDER = ["users", "roles", "structure", "settings", "audit"];

function comparePermissions(a: string, b: string): number {
  const [areaA = "", actionA = ""] = a.split(".");
  const [areaB = "", actionB = ""] = b.split(".");
  const rank = (area: string) => (AREA_ORDER.includes(area) ? AREA_ORDER.indexOf(area) : AREA_ORDER.length);
  if (areaA !== areaB) return rank(areaA) - rank(areaB) || areaA.localeCompare(areaB);
  if (actionA === "view" || actionB === "view") return actionA === "view" ? -1 : 1;
  return actionA.localeCompare(actionB);
}

/** Permission catalog grouped by module: core (null) first, then modules in display order. */
export async function listPermissionGroups(): Promise<PermissionGroup[]> {
  const supabase = await createClient();
  const [permissions, modules] = await Promise.all([
    supabase.from("permissions").select("key, module_key").order("key"),
    supabase.from("modules").select("key").order("sort_order"),
  ]);
  if (permissions.error || modules.error) throw new Error("listPermissionGroups failed");

  const order = [null, ...modules.data.map((m) => m.key)];
  return order
    .map((moduleKey) => ({
      moduleKey,
      permissions: permissions.data
        .filter((p) => p.module_key === moduleKey)
        .map((p) => p.key)
        .sort(comparePermissions),
    }))
    .filter((group) => group.permissions.length > 0);
}
