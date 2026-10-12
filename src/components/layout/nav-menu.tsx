"use client";

import { LayoutDashboard } from "lucide-react";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Link, usePathname } from "@/i18n/navigation";

import type { NavIcon } from "./nav-config";

const ICONS: Record<NavIcon, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
};

export type NavMenuItem = { href: string; label: string; icon: NavIcon };

export function NavMenu({ items }: { items: NavMenuItem[] }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarMenu>
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
              <Link href={item.href} onClick={() => setOpenMobile(false)}>
                <Icon aria-hidden />
                <span>{item.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
