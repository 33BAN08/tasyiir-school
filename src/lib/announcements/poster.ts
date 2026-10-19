import "server-only";

import { areaFor } from "@/lib/auth/roles";
import { blockedPath, getCurrentUser, getPermissions } from "@/lib/auth/session";
import { getModules } from "@/lib/auth/modules";

export type Poster = { id: string; schoolId: string; fullName: string; canManage: boolean };

/**
 * Who may post an announcement: a school account with announcements.manage
 * (any scope), or a teacher (their own classes, to parents). Null for anyone
 * else and when the messaging module is off. The database policies decide the
 * rest; this gives clear errors first.
 */
export async function getPoster(): Promise<Poster | null> {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword || blockedPath(user)) return null;
  if (!user.schoolId || areaFor(user) !== "school") return null;
  const [permissions, modules] = await Promise.all([getPermissions(), getModules()]);
  if (!modules.has("messaging")) return null;
  const canManage = permissions.has("announcements.manage");
  if (!canManage && user.roleKey !== "teacher") return null;
  return { id: user.id, schoolId: user.schoolId, fullName: user.fullName, canManage };
}
