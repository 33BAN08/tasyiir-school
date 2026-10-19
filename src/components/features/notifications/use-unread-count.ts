"use client";

import { useCallback, useEffect, useId, useState } from "react";

import { usePathname, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * The signed-in user's unread count, live. Realtime sends only their own
 * changes (RLS), so a new notification moves the count at once; the count is
 * also read again when the tab comes back (a sleeping phone misses events).
 * On the list page (`listHref`) the page itself is refreshed too. Each caller
 * has its own channel (the bell and the parents' bottom bar run side by side).
 */
export function useUnreadCount(userId: string, initialCount: number, listHref: string) {
  const router = useRouter();
  const pathname = usePathname();
  const channelKey = useId();
  // The live count remembers which server count it was read after: a new page
  // render with another server count wins over an older live one.
  const [live, setLive] = useState({ base: initialCount, value: initialCount });
  const count = live.base === initialCount ? live.value : initialCount;
  const onList = pathname === listHref;

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
      .channel(`notifications:${userId}:${channelKey}`)
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
  }, [userId, channelKey, onList, reload, router]);

  return count;
}

/** Largest number written on a badge. */
export const BADGE_MAX = 9;
