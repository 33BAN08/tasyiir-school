import "server-only";

import { getModules } from "@/lib/auth/modules";
import { getPermissions, type CurrentUser } from "@/lib/auth/session";

// Who may open the grade sheets (/grades), and how. RLS stays the real fence
// (grades table, save_grades); this only decides what the page offers.
//   manage  = grades.manage (director): any class, any year, can write
//   view    = grades.view (surveillant): any class, any year, read-only
//   teacher = role teacher: their own class + subject pairs of the current year
export type GradeAccess = "manage" | "view" | "teacher";

export async function getGradeAccess(user: CurrentUser): Promise<GradeAccess | null> {
  const [permissions, modules] = await Promise.all([getPermissions(), getModules()]);
  if (!modules.has("grades")) return null;
  if (permissions.has("grades.manage")) return "manage";
  if (permissions.has("grades.view")) return "view";
  if (user.roleKey === "teacher") return "teacher";
  return null;
}
