import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "unpaid", href: "/fees" },
  { key: "journal", href: "/fees/journal" },
  { key: "settings", href: "/fees/settings" },
] as const;

export type FeesTab = (typeof TABS)[number]["key"];

/** Impayés · Journal · Réglages: the three pages of the Frais menu. */
export function FeesTabs({ active }: { active: FeesTab }) {
  const t = useTranslations("fees.tabs");
  return (
    // The grey line sits under the scroller (an underline overlapping it would make it scroll vertically).
    <nav
      aria-label={t("label")}
      className="flex max-w-full gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--border)] [scrollbar-width:none]"
      data-fees-tabs
    >
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === active ? "page" : undefined}
          className={cn(
            "flex min-h-11 items-center border-b-2 px-3 text-sm whitespace-nowrap transition-colors",
            tab.key === active
              ? "border-primary font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t(tab.key)}
        </Link>
      ))}
    </nav>
  );
}
