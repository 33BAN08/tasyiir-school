import {
  Bell,
  BellRing,
  Bus,
  CalendarDays,
  ClipboardCheck,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Megaphone,
  MessageSquare,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export const PLANS = ["basic", "pro", "premium"] as const;
export type PlanKey = (typeof PLANS)[number];

export type FeatureKey =
  | "attendance"
  | "justifications"
  | "timetable"
  | "notifications"
  | "people"
  | "messaging"
  | "alerts"
  | "grades"
  | "massar"
  | "fees"
  | "transport"
  | "sms";

export type Feature = { key: FeatureKey; icon: LucideIcon; soon: boolean };

/**
 * What each plan ADDS to the one before (docs/PLAN.md §3). `soon` = not built
 * yet: keep in step with the phases (Phase 9 = messaging, 10 = grades, …).
 */
export const PLAN_FEATURES: Record<PlanKey, Feature[]> = {
  basic: [
    { key: "attendance", icon: ClipboardCheck, soon: false },
    { key: "justifications", icon: FileText, soon: false },
    { key: "timetable", icon: CalendarDays, soon: false },
    { key: "notifications", icon: Bell, soon: false },
    { key: "people", icon: Users, soon: false },
    { key: "messaging", icon: Megaphone, soon: false },
  ],
  pro: [
    { key: "alerts", icon: BellRing, soon: false },
    { key: "grades", icon: GraduationCap, soon: true },
    { key: "massar", icon: FileSpreadsheet, soon: true },
  ],
  premium: [
    { key: "fees", icon: Wallet, soon: true },
    { key: "transport", icon: Bus, soon: true },
    { key: "sms", icon: MessageSquare, soon: true },
  ],
};

/** The first plan that includes a feature; later plans include it too. */
export function planOf(feature: FeatureKey): PlanKey {
  return PLANS.find((plan) => PLAN_FEATURES[plan].some((f) => f.key === feature))!;
}

/** Section anchors, in page order (header + footer links). */
export const SECTION_LINKS = [
  { id: "how", key: "how" },
  { id: "features", key: "features" },
  { id: "plans", key: "plans" },
  { id: "faq", key: "faq" },
] as const;
