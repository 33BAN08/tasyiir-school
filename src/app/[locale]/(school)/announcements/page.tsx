import { AnnouncementsIndex } from "@/components/features/announcements/announcements-index";
import { requireArea } from "@/lib/auth/session";

/** School staff and teachers: announcements for them, and the ones they posted. */
export default async function AnnouncementsPage() {
  const user = await requireArea("school");
  return <AnnouncementsIndex area="school" user={user} />;
}
