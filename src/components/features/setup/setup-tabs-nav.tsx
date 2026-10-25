"use client";

import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { SETUP_TABS, type SetupTabKey } from "@/lib/structure/setup-tabs";
import { cn } from "@/lib/utils";

/** The tabs the user may open (`keys`, chosen on the server). */
export function SetupTabsNav({ keys }: { keys: SetupTabKey[] }) {
  const t = useTranslations("setup.tabs");
  const pathname = usePathname();
  const tabs = SETUP_TABS.filter((tab) => keys.includes(tab.key));
  if (tabs.length < 2) return null;

  return (
    <nav aria-label={t("label")} className="flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-border)]">
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors",
              active
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
