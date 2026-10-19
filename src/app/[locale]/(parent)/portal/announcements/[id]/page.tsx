import { AnnouncementPage } from "@/components/features/announcements/announcement-page";
import { requireArea } from "@/lib/auth/session";

export default async function PortalAnnouncementRoute({ params }: { params: Promise<{ id: string }> }) {
  const [user, { id }] = await Promise.all([requireArea("portal"), params]);
  return <AnnouncementPage area="portal" user={user} id={id} />;
}
