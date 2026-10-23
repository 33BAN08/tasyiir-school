import { Bell } from "lucide-react";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import { BackLink } from "@/components/layout/back-link";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { homeFor } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { listNotifications, LIST_LIMIT } from "@/lib/notifications/queries";

import { NotificationList } from "./notification-list";

/**
 * The signed-in user's notifications, newest first (RLS: only their own), with
 * a way back to their home; `top` = a card above the list (parents: this phone's push). Each page calls requireArea() itself.
 */
export async function NotificationsView({ area, top }: { area: "school" | "portal" | "platform"; top?: ReactNode }) {
  const [t, items, user] = await Promise.all([getTranslations("notifications"), listNotifications(), getCurrentUser()]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {user && <BackLink href={homeFor(user)} label={t("back")} />}
        <PageHeader title={t("title")} description={t("description")} />
      </div>
      {top}
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
