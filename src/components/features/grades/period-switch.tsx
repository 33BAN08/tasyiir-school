import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import type { SheetPeriod } from "@/lib/grades/sheet";
import { cn } from "@/lib/utils";

/** The whole year's tab in a switch with `withYear` (`?period=year`). */
export const YEAR_TAB = "year";

/**
 * S1 · S2 (🔒 on a locked one), kept in `?period=` with the rest of the choice.
 * `withYear` adds "Année" after them (the averages page).
 */
export function PeriodSwitch({ periods, active, query, basePath = "/grades", withYear = false }: {
  periods: SheetPeriod[];
  active: string;
  query: string;
  basePath?: string;
  withYear?: boolean;
}) {
  const t = useTranslations("grades.periods");
  const name = periods.length === 2 ? "semester" : periods.length === 3 ? "trimester" : "period";
  const tabs = [
    ...periods.map((p) => ({ id: p.id, number: p.number, locked: p.locked, label: t(name, { number: p.number }) })),
    ...(withYear ? [{ id: YEAR_TAB, number: 0, locked: false, label: t("year") }] : []),
  ];
  return (
    <nav aria-label={t("label")} className="flex w-fit gap-1 rounded-lg bg-muted p-1">
      {tabs.map((p) => (
        <Link
          key={p.id}
          href={`${basePath}?${query}&period=${p.id}`}
          aria-current={p.id === active ? "page" : undefined}
          data-period-link={p.id === YEAR_TAB ? YEAR_TAB : p.number}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
            p.id === active ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {p.label}
          {p.locked && <Lock className="size-3.5" aria-label={t("locked")} />}
        </Link>
      ))}
    </nav>
  );
}
