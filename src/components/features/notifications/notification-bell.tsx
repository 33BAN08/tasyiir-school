"use client";

import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

import { BADGE_MAX, useUnreadCount } from "./use-unread-count";

type Props = { userId: string; initialCount: number; href: string };

/** The bell: unread count, live (see useUnreadCount). */
export function NotificationBell({ userId, initialCount, href }: Props) {
  const t = useTranslations("notifications");
  const count = useUnreadCount(userId, initialCount, href);

  return (
    <Button asChild variant="ghost" size="icon" className="relative">
      <Link href={href} aria-label={count > 0 ? t("bellUnread", { count }) : t("bell")}>
        <Bell className="size-5" aria-hidden />
        {count > 0 && (
          <span
            className="pointer-events-none absolute end-0.5 top-0.5 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-danger-foreground tabular-nums"
            aria-hidden
          >
            {count > BADGE_MAX ? `${BADGE_MAX}+` : count}
          </span>
        )}
      </Link>
    </Button>
  );
}
