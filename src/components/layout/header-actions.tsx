import { Suspense } from "react";

import { NotificationBellLoader } from "@/components/features/notifications/notification-bell-loader";
import { LocaleSwitcher } from "@/components/features/i18n/locale-switcher";
import { ThemeToggle } from "@/components/features/theme/theme-toggle";
import { Skeleton } from "@/components/ui/skeleton";

import { UserMenuLoader } from "./user-menu-loader";

/** Language, theme and account menu: shared by the desktop topbar and the mobile header. */
export function HeaderActions() {
  return (
    <div className="flex items-center gap-1">
      <Suspense fallback={null}>
        <NotificationBellLoader />
      </Suspense>
      <LocaleSwitcher persist />
      <ThemeToggle />
      <Suspense fallback={<Skeleton className="size-8 rounded-full" />}>
        <UserMenuLoader />
      </Suspense>
    </div>
  );
}
