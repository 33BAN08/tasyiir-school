import { getLocale, getTranslations } from "next-intl/server";
import { Suspense, type ReactNode } from "react";

import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { getDirection, type Locale } from "@/i18n/routing";

import { AppSidebar } from "./app-sidebar";
import { HeaderActions } from "./header-actions";
import { PageSkeleton } from "./page-skeleton";

type Props = { area: "platform" | "school"; children: ReactNode };

/** Desktop-first shell: collapsible sidebar on the start side + topbar. */
export async function AppShell({ area, children }: Props) {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("shell")]);
  const side = getDirection(locale as Locale) === "rtl" ? "right" : "left";

  return (
    <SidebarProvider>
      <AppSidebar area={area} side={side} />
      {/* min-w-0: a wide table (coefficient grid) scrolls inside its card instead of widening the page. */}
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <SidebarTrigger label={t("toggleSidebar")} className="-ms-1" />
          <div className="flex-1" />
          <HeaderActions />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6">
          {/* No auth gate here: layouts and pages render in parallel, so a layout
              check cannot stop a page from rendering. Each page calls requireArea(). */}
          <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
