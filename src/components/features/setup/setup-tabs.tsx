"use client";

import { useTranslations } from "next-intl";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/** Sections of the school structure. Each Phase 4 step adds its tab here. */
const TABS = [
  { key: "years", href: "/setup/years" },
  { key: "levels", href: "/setup/levels" },
  { key: "classes", href: "/setup/classes" },
  { key: "subjects", href: "/setup/subjects" },
  { key: "rooms", href: "/setup/rooms" },
] as const;

/** usePathname() is request-time data, so the tabs bring their own Suspense boundary. */
export function SetupTabs() {
  return (
    <Suspense fallback={<Skeleton className="h-9 w-64" />}>
      <SetupTabsNav />
    </Suspense>
  );
}

function SetupTabsNav() {
  const t = useTranslations("setup.tabs");
  const pathname = usePathname();

  return (
    <nav aria-label={t("label")} className="flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-border)]">
      {TABS.map((tab) => {
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
