import { MegaphoneOff, Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/layout/empty-state";
import { BackLink } from "@/components/layout/back-link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { getPoster } from "@/lib/announcements/poster";
import { listAnnouncements } from "@/lib/announcements/queries";
import { getModules } from "@/lib/auth/modules";
import type { CurrentUser } from "@/lib/auth/session";

import { AnnouncementList } from "./announcement-list";

/**
 * The announcements addressed to the user (or written by them / manageable by
 * them), newest first. School staff and teachers can also post; parents only
 * read. The caller has already run requireArea().
 */
export async function AnnouncementsIndex({ area, user }: { area: "school" | "portal"; user: CurrentUser }) {
  const [t, modules] = await Promise.all([getTranslations("announcements"), getModules()]);
  const staff = area === "school";
  const header = (
    <div className="flex flex-col gap-2">
      {!staff && <BackLink href="/portal" label={t("backHome")} />}
    </div>
  );

  // RLS also hides everything when messaging is off: both lead here.
  if (!modules.has("messaging")) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <PageHeader title={t("title")} description={t(staff ? "descriptionStaff" : "descriptionParent")} />
        <Card className="py-0">
          <EmptyState icon={MegaphoneOff} title={t("notInPlanTitle")} description={t("notInPlanDescription")} />
        </Card>
      </div>
    );
  }

  const [items, poster] = await Promise.all([listAnnouncements(), staff ? getPoster() : null]);
  return (
    <div className="flex flex-col gap-4">
      {header}
      <PageHeader
        title={t("title")}
        description={t(staff ? "descriptionStaff" : "descriptionParent")}
        actions={
          poster && (
            <Button asChild className="min-h-11">
              <Link href="/announcements/new">
                <Plus aria-hidden />
                {t("new")}
              </Link>
            </Button>
          )
        }
      />
      <AnnouncementList
        items={items}
        basePath={staff ? "/announcements" : "/portal/announcements"}
        userId={user.id}
        showAudience={staff}
      />
    </div>
  );
}
