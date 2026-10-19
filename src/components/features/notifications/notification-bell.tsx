"use client";

import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = { userId: string; initialCount: number; href: string };

/** Largest number written on the badge. */
const BADGE_MAX = 9;

/**
 * The bell: unread count, live. Realtime sends only the signed-in user's own
 * changes (RLS), so a new notification moves the count at once; the count is
 * also read again when the tab comes back (a sleeping phone misses events).
 * On the list page the page itself is refreshed too.
 */
export function NotificationBell({ userId, initialCount, href }: Props) {
  const t = useTranslations("notifications");
  const router = useRouter();
  const pathname = usePathname();
  // The live count remembers which server count it was read after: a new page
  // render with another server count wins over an older live one.
  const [live, setLive] = useState({ base: initialCount, value: initialCount });
  const count = live.base === initialCount ? live.value : initialCount;
  const onList = pathname === href;

  const reload = useCallback(async () => {
    const { count: unread } = await createClient()
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null);
    if (unread !== null) setLive({ base: initialCount, value: unread });
  }, [initialCount]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
        () => {
          void reload();
          if (onList) router.refresh();
        },
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [userId, onList, reload, router]);

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
