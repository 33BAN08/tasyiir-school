"use client";

import { CalendarDays, ClipboardCheck, House, MessageSquareText, NotebookPen, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type TeacherNavKey = "home" | "attendance" | "timetable" | "grades" | "remarks";

/** 3 to 5 items (grades / remarks follow the modules). */
const COLUMNS = { 3: "grid-cols-3", 4: "grid-cols-4", 5: "grid-cols-5" } as const;

const ITEMS: Record<TeacherNavKey, { href: string; icon: LucideIcon }> = {
  home: { href: "/dashboard", icon: House },
  attendance: { href: "/attendance", icon: ClipboardCheck },
  timetable: { href: "/my-timetable", icon: CalendarDays },
  grades: { href: "/grades", icon: NotebookPen },
  remarks: { href: "/remarks", icon: MessageSquareText },
};

/**
 * Teachers on a phone: their daily pages at the bottom (keys chosen on the
 * server: grades / remarks only when the module is on). Hidden from md up,
 * where the sidebar is shown. The spacer keeps the last lines above the bar.
 */
export function TeacherBottomNav({ keys }: { keys: TeacherNavKey[] }) {
  const t = useTranslations("teacherHome.nav");
  const pathname = usePathname();

  return (
    <>
      <div className="h-16 md:hidden" aria-hidden />
      <nav
        aria-label={t("label")}
        data-teacher-nav
        className="fixed inset-x-0 bottom-0 z-20 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgb(0_0_0/0.06)] backdrop-blur md:hidden"
      >
        <ul className={cn("mx-auto grid h-16 max-w-md", COLUMNS[keys.length as keyof typeof COLUMNS])}>
          {keys.map((key) => {
            const { href, icon: Icon } = ITEMS[key];
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={key}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-full flex-col items-center justify-center gap-0.5 text-xs outline-none focus-visible:bg-muted",
                    active ? "font-bold text-primary" : "text-muted-foreground",
                  )}
                >
                  <span className={cn("flex h-7 w-12 items-center justify-center rounded-full", active && "bg-primary/12")}>
                    <Icon className="size-5" aria-hidden />
                  </span>
                  {t(key)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
