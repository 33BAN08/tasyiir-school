import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export const GRADING_SECTIONS = ["periods", "rules", "coefficients"] as const;
export type GradingSection = (typeof GRADING_SECTIONS)[number];

/** Semestres · Règles par niveau · Coefficients (kept in `?section=`, with the year). */
export function GradingSectionNav({ yearId, active }: { yearId: string; active: GradingSection }) {
  const t = useTranslations("grading.sections");
  return (
    <nav aria-label={t("label")} className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1">
      {GRADING_SECTIONS.map((section) => (
        <Link
          key={section}
          href={`/setup/grading?year=${yearId}&section=${section}`}
          aria-current={section === active ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
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
