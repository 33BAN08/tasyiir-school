import "server-only";

import { getModules } from "@/lib/auth/modules";
import { areaFor } from "@/lib/auth/roles";
import { blockedPath, getCurrentUser, getPermissions } from "@/lib/auth/session";

export type RemarkStaff = {
  id: string;
  schoolId: string;
  /** May write a remark: attendance.manage (any student) or a teacher (students they teach). */
  canWrite: boolean;
  /** Reads every remark of the school and may delete any: the director or attendance.manage. */
  canModerate: boolean;
  isTeacher: boolean;
};

/**
 * What a school account may do with remarks; null for anyone else and when the
 * messaging module is off. The database policies decide the rest (a teacher
 * only for students of classes they teach this year).
 */
export async function getRemarkStaff(): Promise<RemarkStaff | null> {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword || blockedPath(user)) return null;
  if (!user.schoolId || areaFor(user) !== "school") return null;
  const [permissions, modules] = await Promise.all([getPermissions(), getModules()]);
  if (!modules.has("messaging")) return null;
  const manage = permissions.has("attendance.manage");
  const isTeacher = user.roleKey === "teacher";
  const isDirector = user.roleKey === "director";
  if (!manage && !isTeacher && !isDirector) return null;
  return {
    id: user.id,
    schoolId: user.schoolId,
    canWrite: manage || isTeacher,
    canModerate: manage || isDirector,
    isTeacher,
  };
}
