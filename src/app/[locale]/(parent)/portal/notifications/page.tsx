import { NotificationsView } from "@/components/features/notifications/notifications-view";
import { requireArea } from "@/lib/auth/session";

/** Parents: their notifications (bell). */
export default async function PortalNotificationsPage() {
  await requireArea("portal");
  return <NotificationsView area="portal" />;
}
