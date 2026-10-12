/** Each role lands in one area of the app (docs/PLAN.md §2, docs/DESIGN.md Layout). */
export type Area = "platform" | "school" | "portal" | "driver";

/** Built-in school roles. The platform owner is not here: see `areaFor`. */
const SCHOOL_ROLE_AREAS = {
  director: "school",
  surveillant: "school",
  accountant: "school",
  transport_manager: "school",
  teacher: "school",
  parent: "portal",
  student: "portal",
  driver: "driver",
} as const satisfies Record<string, Exclude<Area, "platform">>;

/** Keys of the built-in roles, each with a label under `roles.*`. */
export type BuiltInRoleKey = "platform_owner" | keyof typeof SCHOOL_ROLE_AREAS;

export const AREA_HOME: Record<Area, string> = {
  platform: "/platform",
  school: "/dashboard",
  portal: "/portal",
  driver: "/driver",
};

/** The fields of the current user that decide their area. */
type AreaUser = { roleKey: string; isPlatformOwner: boolean };

/**
 * The platform area is decided by `isPlatformOwner` (same rule as the DB's
 * is_platform_owner(): no school on the profile nor on the role), never by the
 * role key alone. Custom roles a director creates (e.g. "secretary") are school staff.
 */
export function areaFor(user: AreaUser): Area {
  if (user.isPlatformOwner) return "platform";
  return isBuiltInSchoolRole(user.roleKey) ? SCHOOL_ROLE_AREAS[user.roleKey] : "school";
}

export function homeFor(user: AreaUser): string {
  return AREA_HOME[areaFor(user)];
}

function isBuiltInSchoolRole(roleKey: string): roleKey is keyof typeof SCHOOL_ROLE_AREAS {
  return Object.hasOwn(SCHOOL_ROLE_AREAS, roleKey);
}

/** Built-in roles have a translated label under `roles.*`; custom roles use their own name. */
export function isBuiltInRole(roleKey: string): roleKey is BuiltInRoleKey {
  return roleKey === "platform_owner" || isBuiltInSchoolRole(roleKey);
}

/** Display name of a role: translated for built-in roles, the school's own name for custom ones. */
export function roleLabel(role: { key: string; name: string }, tRoles: (key: BuiltInRoleKey) => string): string {
  return isBuiltInRole(role.key) ? tRoles(role.key) : role.name;
}
