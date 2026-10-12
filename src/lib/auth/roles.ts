/** Each role lands in one area of the app (docs/PLAN.md §2, docs/DESIGN.md Layout). */
export type Area = "platform" | "school" | "portal" | "driver";

const ROLE_AREAS: Record<string, Area> = {
  platform_owner: "platform",
  director: "school",
  surveillant: "school",
  accountant: "school",
  transport_manager: "school",
  teacher: "school",
  parent: "portal",
  student: "portal",
  driver: "driver",
};

export const AREA_HOME: Record<Area, string> = {
  platform: "/platform",
  school: "/dashboard",
  portal: "/portal",
  driver: "/driver",
};

/** Custom roles a director creates (e.g. "secretary") are school staff. */
export function areaForRole(roleKey: string): Area {
  return ROLE_AREAS[roleKey] ?? "school";
}

export function homeForRole(roleKey: string): string {
  return AREA_HOME[areaForRole(roleKey)];
}

/** Built-in roles have a translated label under `roles.*`; custom roles use their own name. */
export function isBuiltInRole(roleKey: string): boolean {
  return roleKey in ROLE_AREAS;
}
