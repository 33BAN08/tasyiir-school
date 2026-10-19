import { areaFor, type Area } from "@/lib/auth/roles";
import { blockedPath, getCurrentUser } from "@/lib/auth/session";
import { countUnread } from "@/lib/notifications/queries";

import { NotificationBell } from "./notification-bell";

/** Where each area reads its notifications. */
export const NOTIFICATIONS_HREF: Partial<Record<Area, string>> = {
  school: "/notifications",
  portal: "/portal/notifications",
};

/** The bell for school staff, teachers and parents; nothing for anyone else (platform owner, drivers). */
export async function NotificationBellLoader() {
  const user = await getCurrentUser();
  if (!user || !user.schoolId || user.mustChangePassword || blockedPath(user)) return null;
  const href = NOTIFICATIONS_HREF[areaFor(user)];
  if (!href) return null;

  return <NotificationBell userId={user.id} initialCount={await countUnread()} href={href} />;
}
