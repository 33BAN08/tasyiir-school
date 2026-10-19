import type { Area } from "@/lib/auth/roles";

export type NavIcon = "dashboard" | "schools" | "plans" | "staff" | "roles" | "structure" | "students" | "parents" | "teachers" | "timetable" | "attendance" | "alerts" | "inbox" | "announcements" | "remarks";

export type NavItem = {
  /** Label key under `nav.*`. */
  key: string;
  /** Path without locale prefix. */
  href: string;
  icon: NavIcon;
  /** Hidden unless the user's role has this permission. */
  permission?: string;
  /** Hidden unless the user has this built-in role (e.g. a teacher's own pages). */
  role?: string;
  /** Hidden unless this module is on for the school (plan or override). */
  module?: string;
};

/** Sidebar entries per desktop area. Each phase adds its own items here. */
export const NAV_ITEMS: Record<"platform" | "school", NavItem[]> = {
  platform: [
    { key: "dashboard", href: "/platform", icon: "dashboard" },
    { key: "schools", href: "/platform/schools", icon: "schools" },
    { key: "plans", href: "/platform/plans", icon: "plans" },
    { key: "demoRequests", href: "/platform/demo-requests", icon: "inbox" },
  ],
  school: [
    { key: "dashboard", href: "/dashboard", icon: "dashboard" },
    { key: "students", href: "/students", icon: "students", permission: "students.view" },
    { key: "parents", href: "/parents", icon: "parents", permission: "parents.manage" },
    { key: "teachers", href: "/teachers", icon: "teachers", permission: "teachers.manage" },
    { key: "timetable", href: "/timetable", icon: "timetable", permission: "timetable.view" },
    { key: "absences", href: "/absences", icon: "attendance", permission: "attendance.view" },
    { key: "myTimetable", href: "/my-timetable", icon: "timetable", role: "teacher" },
    { key: "attendance", href: "/attendance", icon: "attendance", role: "teacher" },
    { key: "remarks", href: "/remarks", icon: "remarks", permission: "attendance.manage", module: "messaging" },
    { key: "remarks", href: "/remarks", icon: "remarks", role: "teacher", module: "messaging" },
    { key: "announcements", href: "/announcements", icon: "announcements", module: "messaging" },
    { key: "staff", href: "/staff", icon: "staff", permission: "users.view" },
    { key: "roles", href: "/staff/roles", icon: "roles", permission: "roles.manage" },
    { key: "setup", href: "/setup", icon: "structure", permission: "structure.manage" },
    { key: "alerts", href: "/settings/alerts", icon: "alerts", permission: "alerts.manage", module: "alerts" },
  ],
} satisfies Partial<Record<Area, NavItem[]>>;
