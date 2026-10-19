import { AnnouncementsIndex } from "@/components/features/announcements/announcements-index";
import { requireArea } from "@/lib/auth/session";

/** Parents: the school's announcements for them. */
export default async function PortalAnnouncementsPage() {
  const user = await requireArea("portal");
  return <AnnouncementsIndex area="portal" user={user} />;
}
