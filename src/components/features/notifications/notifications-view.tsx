import { Bell } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { listNotifications, LIST_LIMIT } from "@/lib/notifications/queries";

import { NotificationList } from "./notification-list";

/** The signed-in user's notifications, newest first (RLS: only their own). Each page calls requireArea() itself. */
export async function NotificationsView({ area }: { area: "school" | "portal" | "platform" }) {
  const [t, items] = await Promise.all([getTranslations("notifications"), listNotifications()]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("title")} description={t("description")} />
      {items.length === 0 ? (
        <Card className="py-0">
          <EmptyState icon={Bell} title={t("emptyTitle")} description={t("emptyDescription")} />
        </Card>
      ) : (
        <>
          <NotificationList items={items} area={area} />
          {items.length >= LIST_LIMIT && <p className="text-xs text-muted-foreground">{t("limit", { count: LIST_LIMIT })}</p>}
        </>
      )}
    </div>
  );
}
