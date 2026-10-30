import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export const FEES_SECTIONS = ["months", "plans", "services"] as const;
export type FeesSection = (typeof FEES_SECTIONS)[number];

/** Mois et échéance · Tarifs par niveau · Services (kept in `?section=`, with the year). */
export function FeesSectionNav({ yearId, active }: { yearId: string; active: FeesSection }) {
  const t = useTranslations("fees.sections");
  return (
    <nav aria-label={t("label")} className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1">
      {FEES_SECTIONS.map((section) => (
        <Link
          key={section}
          href={`/fees/settings?year=${yearId}&section=${section}`}
          aria-current={section === active ? "page" : undefined}
          className={cn(
            "flex min-h-11 items-center rounded-md px-3 text-sm whitespace-nowrap transition-colors",
            section === active
              ? "bg-background font-medium text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t(section)}
        </Link>
      ))}
    </nav>
  );
}
