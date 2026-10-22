import { BookOpen, Bus, FileSpreadsheet, GraduationCap, MessageSquare, Wallet, type LucideIcon } from "lucide-react";

/** Plans named by school size (display only: the DB plan keys stay basic / pro / premium). */
export const PLANS = ["small", "medium", "large"] as const;
export type PlanKey = (typeof PLANS)[number];

/**
 * Prices in DH (no VAT mention). A year = 12 months for the price of 10.
 * Display only: the platform's `plans` table does not hold these yet.
 */
export const PLAN_OFFER: Record<PlanKey, { monthly: number; yearly: number; alerts: boolean }> = {
  small: { monthly: 290, yearly: 2900, alerts: false },
  medium: { monthly: 590, yearly: 5900, alerts: true },
  large: { monthly: 990, yearly: 9900, alerts: true },
};

export const RECOMMENDED_PLAN: PlanKey = "medium";

/** What a year saves against 12 monthly payments. */
export function yearlySaving(plan: PlanKey): number {
  const { monthly, yearly } = PLAN_OFFER[plan];
  return monthly * 12 - yearly;
}

/**
 * Comparison table rows (`landing.pricing.compare.rows.<key>`). A row is either
 * a text per plan (`compare.values.<key>.<plan>`) or included / not included.
 * Only features that work end to end with a passing test belong here.
 */
type CompareRow = { key: string; text: true } | { key: string; included: Record<PlanKey, boolean> };

const ALL = { small: true, medium: true, large: true };

export const COMPARE_DIFFERENCES: CompareRow[] = [
  { key: "students", text: true },
  { key: "admins", text: true },
  { key: "alerts", included: { small: false, medium: true, large: true } },
  { key: "visits", text: true },
  { key: "namedContact", included: { small: false, medium: false, large: true } },
  { key: "support", text: true },
];

export const COMPARE_ALL_PLANS: CompareRow[] = [
  { key: "teachersParents", included: ALL },
  { key: "rollCall", included: ALL },
  { key: "parentAlert", included: ALL },
  { key: "justifications", included: ALL },
  { key: "totals", included: ALL },
  { key: "timetable", included: ALL },
  { key: "people", included: ALL },
  { key: "announcements", included: ALL },
  { key: "remarks", included: ALL },
  { key: "contact", included: ALL },
  { key: "phoneLogin", included: ALL },
  { key: "languages", included: ALL },
  { key: "import", included: ALL },
  { key: "noSetupFee", included: ALL },
];

export type SoonKey = "grades" | "massar" | "fees" | "homework" | "transport" | "sms";

/**
 * Not built yet: only in the "Bientôt" section, never inside a plan or the
 * comparison table. Move one out once it works end to end with a passing test.
 */
export const COMING_SOON: { key: SoonKey; icon: LucideIcon }[] = [
  { key: "grades", icon: GraduationCap },
  { key: "massar", icon: FileSpreadsheet },
  { key: "fees", icon: Wallet },
  { key: "homework", icon: BookOpen },
  { key: "transport", icon: Bus },
  { key: "sms", icon: MessageSquare },
];

/** Section anchors, in page order (header + footer links). */
export const SECTION_LINKS = [
  { id: "how", key: "how" },
  { id: "features", key: "features" },
  { id: "plans", key: "plans" },
  { id: "faq", key: "faq" },
] as const;
