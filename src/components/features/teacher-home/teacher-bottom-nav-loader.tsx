import { getModules } from "@/lib/auth/modules";
import { blockedPath, getCurrentUser } from "@/lib/auth/session";

import { TeacherBottomNav, type TeacherNavKey } from "./teacher-bottom-nav";

/** The phone bottom bar, for teachers only (other school roles keep the sidebar menu). */
export async function TeacherBottomNavLoader() {
  const user = await getCurrentUser();
  if (!user || !user.schoolId || user.roleKey !== "teacher" || user.mustChangePassword || blockedPath(user)) return null;
  const modules = await getModules();
  const keys: TeacherNavKey[] = ["home", "attendance", "timetable"];
  if (modules.has("grades")) keys.push("grades");
  if (modules.has("messaging")) keys.push("remarks");
  return <TeacherBottomNav keys={keys} />;
}
