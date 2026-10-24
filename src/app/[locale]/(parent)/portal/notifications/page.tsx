import { PushCard } from "@/components/features/push/push-card";
import { NotificationsView } from "@/components/features/notifications/notifications-view";
import { requireArea } from "@/lib/auth/session";
import { getPushPreferences } from "@/lib/push/preferences";

/** Parents: their notifications (bell), and notifications on this phone (web push) with their switches. */
export default async function PortalNotificationsPage() {
  await requireArea("portal");
  return <NotificationsView area="portal" top={<PushCard preferences={await getPushPreferences()} />} />;
}
