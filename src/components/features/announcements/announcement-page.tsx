import { notFound } from "next/navigation";

import { getPoster } from "@/lib/announcements/poster";
import { getAnnouncement } from "@/lib/announcements/queries";
import { getModules } from "@/lib/auth/modules";
import type { CurrentUser } from "@/lib/auth/session";

import { AnnouncementDetail } from "./announcement-detail";

/**
 * One announcement for its page (school or portal). Not found when it does not
 * exist or is not for this user (RLS). The author, and anyone with
 * announcements.manage, may edit or delete. The caller has run requireArea().
 */
export async function AnnouncementPage({ area, user, id }: { area: "school" | "portal"; user: CurrentUser; id: string }) {
  const staff = area === "school";
  const [announcement, poster, modules] = await Promise.all([
    getAnnouncement(id),
    staff ? getPoster() : null,
    getModules(),
  ]);
  if (!announcement || !modules.has("messaging")) notFound();

  return (
    <AnnouncementDetail
      announcement={announcement}
      basePath={staff ? "/announcements" : "/portal/announcements"}
      staff={staff}
      canChange={Boolean(poster) && (poster?.canManage || announcement.createdBy === user.id)}
    />
  );
}
