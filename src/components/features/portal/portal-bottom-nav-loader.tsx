import { blockedPath, getCurrentUser } from "@/lib/auth/session";
import { countUnread } from "@/lib/notifications/queries";

import { PortalBottomNav } from "./portal-bottom-nav";

/** The phone bottom bar, for parents only (students and drivers share the mobile shell). */
export async function PortalBottomNavLoader() {
  const user = await getCurrentUser();
  if (!user || !user.schoolId || user.roleKey !== "parent" || user.mustChangePassword || blockedPath(user)) return null;
  return <PortalBottomNav userId={user.id} initialCount={await countUnread()} />;
}
