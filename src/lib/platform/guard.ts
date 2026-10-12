import "server-only";

import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";

/**
 * For platform Server Actions, which use the secret key (RLS bypassed):
 * this check IS the access control. Null unless the caller is the platform owner.
 */
export async function getPlatformOwner(): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return null;
  return user.isPlatformOwner ? user : null;
}
