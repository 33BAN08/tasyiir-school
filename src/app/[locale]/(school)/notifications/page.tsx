import { NotificationsView } from "@/components/features/notifications/notifications-view";
import { requireArea } from "@/lib/auth/session";

/** School staff and teachers: their notifications (bell). */
export default async function NotificationsPage() {
  await requireArea("school");
  return <NotificationsView area="school" />;
}
