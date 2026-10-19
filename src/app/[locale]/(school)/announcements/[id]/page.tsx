import { AnnouncementPage } from "@/components/features/announcements/announcement-page";
import { requireArea } from "@/lib/auth/session";

export default async function AnnouncementRoute({ params }: { params: Promise<{ id: string }> }) {
  const [user, { id }] = await Promise.all([requireArea("school"), params]);
  return <AnnouncementPage area="school" user={user} id={id} />;
}
