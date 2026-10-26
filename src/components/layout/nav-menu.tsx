"use client";

import {
  BellRing,
  Building2,
  CalendarDays,
  ChartNoAxesColumn,
  ClipboardCheck,
  GraduationCap,
  Inbox,
  Layers,
  LayoutDashboard,
  Megaphone,
  MessageSquareText,
  NotebookPen,
  Package,
  Presentation,
  School,
  ShieldCheck,
  Users,
  UsersRound,
} from "lucide-react";

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
  schools: School,
  plans: Package,
  staff: Users,
  roles: ShieldCheck,
  structure: Layers,
  students: GraduationCap,
  parents: UsersRound,
  teachers: Presentation,
  timetable: CalendarDays,
  attendance: ClipboardCheck,
  alerts: BellRing,
  inbox: Inbox,
  announcements: Megaphone,
  remarks: MessageSquareText,
  school: Building2,
  grades: NotebookPen,
  averages: ChartNoAxesColumn,
};

export type NavMenuItem = { href: string; label: string; icon: NavIcon };

export function NavMenu({ items }: { items: NavMenuItem[] }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  // Most specific match wins: on /platform/schools, "Schools" is active, not "/platform".
  const activeHref = items
    .map((item) => item.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <SidebarMenu>
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const isActive = item.href === activeHref;
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
