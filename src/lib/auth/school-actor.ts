import "server-only";

import { areaFor } from "@/lib/auth/roles";
import { blockedPath, getCurrentUser, getPermissions, type CurrentUser } from "@/lib/auth/session";

export type SchoolActor = CurrentUser & { schoolId: string; permissions: ReadonlySet<string> };

/**
 * Caller check for school Server Actions. With the secret key (auth accounts,
 * Phase 3) this check IS the access control; with the session client (school
 * data, Phase 4 on) RLS is the final fence and this gives clear errors first.
 * Null unless the caller is an active,
 * signed-in school user (own password set, school active, not deactivated)
 * whose role has `permission`. Every write must then stay in `schoolId`.
 */
export async function getSchoolActor(permission: string): Promise<SchoolActor | null> {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword || blockedPath(user)) return null;
  if (!user.schoolId || areaFor(user) !== "school") return null;

  // Read through RLS with the caller's own session: deactivated or suspended → empty.
  const permissions = await getPermissions();
  if (!permissions.has(permission)) return null;

  return { ...user, schoolId: user.schoolId, permissions };
}
