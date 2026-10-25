import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenuSkeleton,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { getModules } from "@/lib/auth/modules";
import { getCurrentUser, getPermissions } from "@/lib/auth/session";
import { BRAND } from "@/lib/brand";

import { NAV_ITEMS } from "./nav-config";
import { NavMenu } from "./nav-menu";
import { SchoolBrand } from "./school-brand";

type Props = { area: "platform" | "school"; side: "left" | "right" };

export async function AppSidebar({ area, side }: Props) {
  const t = await getTranslations("shell");

  return (
    <Sidebar
      side={side}
      collapsible="icon"
      srTitle={t("navigation")}
      srDescription={t("navigationDescription")}
    >
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border">
        <Suspense fallback={<Skeleton className="h-8 w-40" />}>
          <SchoolBrand />
        </Suspense>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <Suspense fallback={<SidebarMenuSkeleton showIcon />}>
            <AreaNav area={area} />
          </Suspense>
        </SidebarGroup>
      </SidebarContent>
      {area === "school" && (
        <SidebarFooter className="text-center text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          {t("poweredBy", { brand: BRAND.name })}
        </SidebarFooter>
      )}
      <SidebarRail />
    </Sidebar>
  );
}

/** Nav items the user's role may see, with translated labels. */
async function AreaNav({ area }: Pick<Props, "area">) {
  const [permissions, modules, user, t] = await Promise.all([
    getPermissions(),
    getModules(),
    getCurrentUser(),
    getTranslations("nav"),
  ]);
  const items = NAV_ITEMS[area]
    .filter((item) => !item.permission || permissions.has(item.permission))
    .filter((item) => !item.role || item.role === user?.roleKey)
    .filter((item) => !item.module || modules.has(item.module))
    .filter((item) => !item.hiddenWith || !permissions.has(item.hiddenWith))
    .map((item) => ({ href: item.href, icon: item.icon, label: t(item.key) }));

  return <NavMenu items={items} />;
}
