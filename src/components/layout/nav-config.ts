import type { Area } from "@/lib/auth/roles";

export type NavIcon = "dashboard" | "schools" | "plans" | "staff" | "roles" | "structure" | "students" | "parents" | "teachers" | "timetable" | "attendance" | "alerts" | "inbox" | "announcements" | "remarks" | "school" | "grades" | "averages";

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
  /** Hidden when the user also has this permission (another item already leads there). */
  hiddenWith?: string;
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
    // Grade sheets: a teacher their own pairs; grades.view (surveillant read-only, director) any class.
    { key: "gradeEntry", href: "/grades", icon: "grades", role: "teacher", module: "grades" },
    { key: "gradeEntry", href: "/grades", icon: "grades", permission: "grades.view", module: "grades" },
    { key: "averages", href: "/grades/averages", icon: "averages", permission: "grades.view", module: "grades" },
    { key: "staff", href: "/staff", icon: "staff", permission: "users.view" },
    { key: "roles", href: "/staff/roles", icon: "roles", permission: "roles.manage" },
    { key: "setup", href: "/setup", icon: "structure", permission: "structure.manage" },
    // Read-only grading setup for grades.view without structure.manage (surveillant).
    { key: "grading", href: "/setup/grading", icon: "structure", permission: "grades.view", module: "grades", hiddenWith: "structure.manage" },
    { key: "alerts", href: "/settings/alerts", icon: "alerts", permission: "alerts.manage", module: "alerts" },
    { key: "schoolSettings", href: "/settings/school", icon: "school", permission: "settings.manage" },
  ],
} satisfies Partial<Record<Area, NavItem[]>>;
