import { Suspense } from "react";

import { NotificationsView } from "@/components/features/notifications/notifications-view";
import { Skeleton } from "@/components/ui/skeleton";
import { requireArea } from "@/lib/auth/session";

/** The platform owner's notifications (subscription reminders). */
export default function PlatformNotificationsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <PlatformNotifications />
    </Suspense>
  );
}

async function PlatformNotifications() {
  // Page-level check (inside the page's own tree, never only in a layout).
  await requireArea("platform");
  return (
    <div className="mx-auto w-full max-w-4xl">
      <NotificationsView area="platform" />
    </div>
  );
}
