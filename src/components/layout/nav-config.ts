import type { Area } from "@/lib/auth/roles";

export type NavIcon = "dashboard" | "schools" | "plans" | "staff" | "roles" | "structure" | "students" | "parents" | "teachers";

export type NavItem = {
  /** Label key under `nav.*`. */
  key: string;
  /** Path without locale prefix. */
  href: string;
  icon: NavIcon;
  /** Hidden unless the user's role has this permission. */
  permission?: string;
};

/** Sidebar entries per desktop area. Each phase adds its own items here. */
export const NAV_ITEMS: Record<"platform" | "school", NavItem[]> = {
  platform: [
    { key: "dashboard", href: "/platform", icon: "dashboard" },
    { key: "schools", href: "/platform/schools", icon: "schools" },
    { key: "plans", href: "/platform/plans", icon: "plans" },
  ],
  school: [
    { key: "dashboard", href: "/dashboard", icon: "dashboard" },
    { key: "students", href: "/students", icon: "students", permission: "students.view" },
    { key: "parents", href: "/parents", icon: "parents", permission: "parents.manage" },
    { key: "teachers", href: "/teachers", icon: "teachers", permission: "teachers.manage" },
    { key: "staff", href: "/staff", icon: "staff", permission: "users.view" },
    { key: "roles", href: "/staff/roles", icon: "roles", permission: "roles.manage" },
    { key: "setup", href: "/setup", icon: "structure", permission: "structure.manage" },
  ],
} satisfies Partial<Record<Area, NavItem[]>>;
