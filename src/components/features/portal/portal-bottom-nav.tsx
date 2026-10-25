"use client";

import { Bell, CalendarCheck, House, Megaphone, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { BADGE_MAX, useUnreadCount } from "@/components/features/notifications/use-unread-count";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const NOTIFICATIONS = "/portal/notifications";

type Props = { userId: string; initialCount: number };

/**
 * Parents on a phone: Accueil · Absences · Annonces · Notifications (live unread badge),
 * fixed at the bottom. Hidden from md up (the header is enough there). The
 * spacer keeps the page's last lines above the bar.
 */
export function PortalBottomNav({ userId, initialCount }: Props) {
  const t = useTranslations("portal.nav");
  const tNotifications = useTranslations("notifications");
  const pathname = usePathname();
  const count = useUnreadCount(userId, initialCount, NOTIFICATIONS);

  const items: { href: string; label: string; icon: LucideIcon; active: boolean; badge?: number; ariaLabel?: string }[] = [
    { href: "/portal", label: t("home"), icon: House, active: pathname === "/portal" },
    { href: "/portal/absences", label: t("absences"), icon: CalendarCheck, active: pathname.startsWith("/portal/absences") },
    {
      href: "/portal/announcements",
      label: t("announcements"),
      icon: Megaphone,
      active: pathname.startsWith("/portal/announcements"),
    },
    {
      href: NOTIFICATIONS,
      label: t("notifications"),
      icon: Bell,
      active: pathname === NOTIFICATIONS,
      badge: count,
      ariaLabel: count > 0 ? tNotifications("bellUnread", { count }) : undefined,
    },
  ];

  return (
    <>
      <div className="h-16 md:hidden" aria-hidden />
      <nav
        aria-label={t("label")}
        data-portal-nav
        className="fixed inset-x-0 bottom-0 z-20 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgb(0_0_0/0.06)] backdrop-blur md:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-md grid-cols-4">
          {items.map(({ href, label, icon: Icon, active, badge, ariaLabel }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={ariaLabel}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-0.5 text-xs outline-none focus-visible:bg-muted",
                  active ? "font-bold text-primary" : "text-muted-foreground",
                )}
              >
                <span className={cn("relative flex h-7 w-12 items-center justify-center rounded-full", active && "bg-primary/12")}>
                  <Icon className="size-5" aria-hidden />
                  {badge !== undefined && badge > 0 && (
                    <span
                      className="absolute -end-2.5 -top-1.5 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-danger-foreground tabular-nums"
                      aria-hidden
                    >
                      {badge > BADGE_MAX ? `${BADGE_MAX}+` : badge}
                    </span>
                  )}
                </span>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
