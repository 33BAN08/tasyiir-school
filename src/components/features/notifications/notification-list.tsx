"use client";

import { BellRing, CalendarClock, CalendarX2, Check, CheckCheck, Clock, Undo2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useSyncExternalStore, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { formatDate, formatDateTime, formatMonth, isolate, ltr } from "@/lib/format";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/notifications/actions";
import type { NotificationItem } from "@/lib/notifications/types";
import { studentName } from "@/lib/students/names";
import { cn } from "@/lib/utils";

type Props = { items: NotificationItem[]; area: "school" | "portal" | "platform" };

/** True in the browser only: times are shown there, because the server's time-zone data for Morocco is outdated. */
function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function NotificationList({ items, area }: Props) {
  const t = useTranslations("notifications");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [readNow, setReadNow] = useState<Set<string>>(new Set());
  const unread = items.filter((n) => !n.readAt && !readNow.has(n.id)).length;

  function markAll() {
    startTransition(async () => {
      await markAllNotificationsRead();
      setReadNow(new Set(items.map((n) => n.id)));
      router.refresh();
    });
  }

  function markOne(id: string) {
    setReadNow((prev) => new Set(prev).add(id));
    void markNotificationRead(id).then(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-9 items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {unread > 0 ? t("unreadCount", { count: unread }) : t("allRead")}
        </p>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={markAll} disabled={pending}>
            <CheckCheck aria-hidden />
            {t("markAllRead")}
          </Button>
        )}
      </div>
      <ul className="flex flex-col divide-y rounded-lg border bg-card">
        {items.map((n) => (
          <Row key={n.id} item={n} area={area} read={Boolean(n.readAt) || readNow.has(n.id)} onRead={markOne} />
        ))}
      </ul>
    </div>
  );
}

function Row({ item, area, read, onRead }: { item: NotificationItem; area: Props["area"]; read: boolean; onRead: (id: string) => void }) {
  const t = useTranslations("notifications");
  const locale = useLocale();
  const mounted = useMounted();
  const { data } = item;

  const name = isolate(item.student ? studentName(item.student, locale) : t("aStudent"));
  const when = {
    date: data.date ? ltr(formatDate(data.date)) : "",
    hours: ltr(`${data.start ?? ""}–${data.end ?? ""}`),
    subject: isolate(data.subject ?? ""),
  };

  let Icon = CalendarX2;
  let title: string;
  let body: string;
  if (item.type === "absence") {
    title = t("absence.title", { name });
    body = t("absence.body", when);
  } else if (item.type === "unjustified_absences") {
    Icon = CalendarClock;
    title = t("unjustified.title", { name });
    body = t("unjustified.body", { days: data.days ?? 0, month: data.month ? formatMonth(data.month, locale) : "" });
  } else if (item.type === "subscription_expiring") {
    Icon = CalendarClock;
    const school = isolate(data.school_name ?? "");
    title = area === "platform" ? t("subscription.titlePlatform", { school }) : t("subscription.title");
    body = t("subscription.body", {
      kind: data.status === "trial" ? "trial" : "active",
      plan: isolate(data.plan ?? ""),
      date: data.last_day ? ltr(formatDate(data.last_day)) : "",
      days: data.days_left ?? 0,
    });
  } else if (item.type === "repeated_lateness") {
    Icon = Clock;
    title = t("lateness.title", { name });
    body = t("lateness.body", {
      count: data.count ?? 0,
      windowDays: data.window_days ?? 0,
      from: data.from ? ltr(formatDate(data.from)) : "",
      to: data.to ? ltr(formatDate(data.to)) : "",
    });
  } else {
    Icon = Undo2;
    title = t("corrected.title", { name });
    body =
      data.now === "cancelled"
        ? t("corrected.cancelled")
        : data.now === "late"
          ? data.minutes_late
            ? t("corrected.lateMinutes", { ...when, minutes: data.minutes_late })
            : t("corrected.late", when)
          : t("corrected.present", when);
  }

  // A parent opens the child's absences; staff (daily alerts) the student's page;
  // the platform owner the school's page (subscription reminders).
  const href =
    area === "platform"
      ? data.school_id
        ? `/platform/schools/${data.school_id}`
        : null
      : !item.studentId
        ? null
        : area === "portal"
          ? `/portal/absences?child=${item.studentId}`
          : `/students/${item.studentId}`;
  const content = (
    <>
      <span
        className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full", read ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary")}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn("text-sm", read ? "font-normal" : "font-semibold")}>{title}</span>
        <span className="text-sm text-muted-foreground">{body}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{mounted ? ltr(formatDateTime(item.createdAt)) : " "}</span>
      </span>
      {!read && <BellRing className="mt-1 size-4 shrink-0 text-primary" aria-label={t("unread")} />}
    </>
  );
  const rowClass = "flex min-h-14 w-full items-start gap-3 p-3 text-start";

  return (
    <li data-read={read ? "true" : "false"} className="relative">
      {href ? (
        <Link href={href} onClick={() => !read && onRead(item.id)} className={cn(rowClass, "hover:bg-muted/50")}>
          {content}
        </Link>
      ) : (
        <div className={rowClass}>{content}</div>
      )}
      {!read && !href && (
        <Button variant="ghost" size="sm" className="absolute end-2 bottom-2" onClick={() => onRead(item.id)}>
          <Check aria-hidden />
          {t("markRead")}
        </Button>
      )}
    </li>
  );
}
