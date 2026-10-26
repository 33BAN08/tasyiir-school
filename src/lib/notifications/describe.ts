import { formatDate, formatMonth, isolate, ltr } from "@/lib/format";
import { formatMobile } from "@/lib/parents/phone";
import { studentName } from "@/lib/students/names";

import type { NotificationItem } from "./types";

// The sentence and the page of a notification, written when it is shown (list) or
// pushed (Phase 10), in the reader's language. Pure: `t` is the "notifications"
// translator of next-intl (useTranslations in the list, getTranslations for a push).

type Translate = (key: string, values?: Record<string, string | number>) => string;
export type NotificationArea = "school" | "portal" | "platform";

export type NotificationText = { title: string; body: string; href: string | null };

export function describeNotification(
  item: Pick<NotificationItem, "type" | "studentId" | "student" | "data">,
  { t, locale, area }: { t: Translate; locale: string; area: NotificationArea },
): NotificationText {
  const { data } = item;
  const name = isolate(item.student ? studentName(item.student, locale) : t("aStudent"));
  const when = {
    date: data.date ? ltr(formatDate(data.date)) : "",
    hours: ltr(`${data.start ?? ""}–${data.end ?? ""}`),
    subject: isolate(data.subject ?? ""),
  };

  let title: string;
  let body: string;
  if (item.type === "absence") {
    title = t("absence.title", { name });
    body = t("absence.body", when);
  } else if (item.type === "unjustified_absences") {
    title = t("unjustified.title", { name });
    body = t("unjustified.body", { days: data.days ?? 0, month: data.month ? formatMonth(data.month, locale) : "" });
  } else if (item.type === "subscription_expiring") {
    const school = isolate(data.school_name ?? "");
    title = area === "platform" ? t("subscription.titlePlatform", { school }) : t("subscription.title");
    body = t("subscription.body", {
      kind: data.status === "trial" ? "trial" : "active",
      plan: isolate(data.plan ?? ""),
      date: data.last_day ? ltr(formatDate(data.last_day)) : "",
      days: data.days_left ?? 0,
    });
  } else if (item.type === "demo_request") {
    title = t("demoRequest.title", { kind: data.kind === "trial" ? "trial" : "demo", school: isolate(data.school_name ?? "") });
    body = t("demoRequest.body", {
      name: isolate(data.full_name ?? ""),
      city: isolate(data.city ?? ""),
      phone: data.phone ? ltr(formatMobile(data.phone)) : "",
    });
  } else if (item.type === "remark") {
    title = t("remark.title", { name });
    body = t(`remark.types.${data.remark_type ?? "behavior"}`);
  } else if (item.type === "grades_published") {
    const period = data.period_number ?? null;
    title = t(data.republished ? "grades.titleUpdated" : "grades.title", { name });
    body = period === null ? t("grades.year") : t("grades.period", { number: period });
  } else if (item.type === "announcement") {
    title = t("announcement.title");
    body = isolate(data.title ?? "");
  } else if (item.type === "repeated_lateness") {
    title = t("lateness.title", { name });
    body = t("lateness.body", {
      count: data.count ?? 0,
      windowDays: data.window_days ?? 0,
      from: data.from ? ltr(formatDate(data.from)) : "",
      to: data.to ? ltr(formatDate(data.to)) : "",
    });
  } else {
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

  return { title, body, href: notificationHref(item, area) };
}

/**
 * A parent opens the child's absences / remarks or the announcement; staff (daily
 * alerts) the student's page; the platform owner the school's page (subscription
 * reminders) or the demo requests.
 */
export function notificationHref(item: Pick<NotificationItem, "type" | "studentId" | "data">, area: NotificationArea): string | null {
  const { data } = item;
  if (item.type === "announcement") {
    return data.announcement_id ? `${area === "portal" ? "/portal" : ""}/announcements/${data.announcement_id}` : null;
  }
  if (item.type === "remark") return `/portal/remarks?child=${item.studentId}`;
  if (item.type === "grades_published") {
    return data.publication_id ? `/portal/grades/${data.publication_id}?child=${item.studentId}` : `/portal/grades?child=${item.studentId}`;
  }
  if (area === "platform") {
    if (item.type === "demo_request") return "/platform/demo-requests";
    return data.school_id ? `/platform/schools/${data.school_id}` : null;
  }
  if (!item.studentId) return null;
  return area === "portal" ? `/portal/absences?child=${item.studentId}` : `/students/${item.studentId}`;
}
