import type { Area } from "@/lib/auth/roles";

export type NavIcon = "dashboard" | "schools";

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
  ],
  school: [{ key: "dashboard", href: "/dashboard", icon: "dashboard" }],
} satisfies Partial<Record<Area, NavItem[]>>;
