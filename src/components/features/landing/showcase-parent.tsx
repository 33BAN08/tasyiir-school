import { Bell, BellRing, CalendarCheck, CalendarDays, CalendarX2, House, Megaphone, Paperclip, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { formatDate, isolate, ltr } from "@/lib/format";
import { cn } from "@/lib/utils";

import { AppBar } from "./phone-frame";
import { DEMO_DAY } from "./showcase-data";

// Drawn copies of the parent's notifications (/portal/notifications, with the
// phone bottom bar) and the "Justifier une absence" dialog: same texts and layout.

export function ParentAlertScreen() {
  const t = useTranslations("notifications");
  const tn = useTranslations("portal.nav");
  const tl = useTranslations("landing");
  const day = ltr(formatDate(DEMO_DAY));

  const rows = [
    {
      Icon: CalendarX2,
      read: false,
      title: t("absence.title", { name: isolate(tl("hero.students.salma")) }),
      body: t("absence.body", { subject: isolate(tl("hero.timetable.arabic")), hours: ltr("08:00–09:00"), date: day }),
      at: `${formatDate(DEMO_DAY)} 08:15`,
    },
    {
      Icon: Megaphone,
      read: true,
      title: t("announcement.title"),
      body: isolate(tl("showcase.demo.announcement")),
      at: "09/10/2026 17:30",
    },
  ];
  const nav = [
    { label: tn("home"), Icon: House },
    { label: tn("absences"), Icon: CalendarCheck },
    { label: tn("announcements"), Icon: Megaphone },
    { label: tn("notifications"), Icon: Bell, active: true, badge: 1 },
  ];

  return (
    <>
      <AppBar school={tl("showcase.school")} />
      <div className="flex flex-1 flex-col gap-3 overflow-hidden p-3">
        <p className="text-base font-semibold">{t("title")}</p>
        <p className="text-xs text-lp-muted">{t("unreadCount", { count: 1 })}</p>
        <ul className="flex flex-col divide-y divide-lp-line rounded-lg border border-lp-line bg-lp-surface">
          {rows.map(({ Icon, read, title, body, at }) => (
            <li key={title} className="flex items-start gap-2 p-2.5">
              <span
                className={cn(
                  "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                  read ? "bg-lp-tint text-lp-muted" : "bg-lp-brand/10 text-lp-brand",
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={cn("text-xs", read ? "font-normal" : "font-semibold")}>{title}</span>
                <span className="text-xs text-lp-muted">{body}</span>
                <span className="text-[0.625rem] text-lp-muted tabular-nums">{ltr(at)}</span>
              </span>
              {!read && <BellRing className="mt-1 size-3.5 shrink-0 text-lp-brand" />}
            </li>
          ))}
        </ul>
      </div>
      <ul className="grid h-14 shrink-0 grid-cols-4 border-t border-lp-line bg-lp-bg">
        {nav.map(({ label, Icon, active, badge }) => (
          <li
            key={label}
            className={cn(
              "flex min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 text-[0.5625rem]",
              active ? "font-semibold text-lp-brand" : "text-lp-muted",
            )}
          >
            <span className="relative">
              <Icon className="size-4" />
              {badge && (
                <span className="absolute -end-2 -top-1.5 flex size-3.5 items-center justify-center rounded-full bg-lp-app-danger text-[0.5rem] font-bold text-lp-on-brand">
                  {badge}
                </span>
              )}
            </span>
            {label}
          </li>
        ))}
      </ul>
    </>
  );
}

export function JustifyScreen() {
  const t = useTranslations("portal.absences.form");
  const tl = useTranslations("landing");

  return (
    <>
      <AppBar school={tl("showcase.school")} />
      {/* The dialog over the dimmed absences page. */}
      <div className="relative flex flex-1 items-end bg-lp-ink/40 p-2">
        <div className="flex w-full flex-col gap-3 rounded-xl bg-lp-surface p-3 shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold">{t("title")}</p>
              <p className="text-[0.6875rem] text-lp-muted">{t("description", { name: isolate(tl("hero.students.salma")) })}</p>
            </div>
            <X className="size-4 shrink-0 text-lp-muted" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: t("from"), value: DEMO_DAY },
              { label: t("to"), value: "2026-10-13" },
            ].map(({ label, value }) => (
              <div key={label} className="flex flex-col gap-1">
                <span className="text-[0.6875rem] font-medium">{label}</span>
                <span className="flex h-8 items-center justify-between rounded-md border border-lp-line px-2 text-xs">
                  <span dir="ltr">{formatDate(value)}</span>
                  <CalendarDays className="size-3.5 text-lp-muted" />
                </span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[0.6875rem] font-medium">{t("reason")}</span>
            <span className="min-h-12 rounded-md border border-lp-line px-2 py-1.5 text-xs">{tl("showcase.demo.reason")}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[0.6875rem] font-medium">
              {t("file")} <span className="font-normal text-lp-muted">({t("optional")})</span>
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex h-7 items-center gap-1 rounded-md border border-lp-line px-2 text-[0.6875rem] font-medium">
                <Paperclip className="size-3.5" />
                {t("changeFile")}
              </span>
              <span className="flex items-center gap-1 text-[0.6875rem]">
                <bdi>certificat.jpg</bdi>
                <X className="size-3 text-lp-muted" />
              </span>
            </div>
            <span className="text-[0.625rem] leading-snug text-lp-muted">{t("fileHint")}</span>
          </div>
          <div className="flex justify-end gap-2">
            <span className="inline-flex h-8 items-center rounded-md border border-lp-line px-3 text-xs font-medium">{t("cancel")}</span>
            <span className="inline-flex h-8 items-center rounded-md bg-lp-brand px-3 text-xs font-semibold text-lp-on-brand">
              {t("send")}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
