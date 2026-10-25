import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import type { SheetPeriod } from "@/lib/grades/sheet";
import { cn } from "@/lib/utils";

/** S1 · S2 (🔒 on a locked one), kept in `?period=` with the rest of the choice. */
export function PeriodSwitch({ periods, active, query }: { periods: SheetPeriod[]; active: string; query: string }) {
  const t = useTranslations("grades.periods");
  const name = periods.length === 2 ? "semester" : periods.length === 3 ? "trimester" : "period";
  return (
    <nav aria-label={t("label")} className="flex w-fit gap-1 rounded-lg bg-muted p-1">
      {periods.map((p) => (
        <Link
          key={p.id}
          href={`/grades?${query}&period=${p.id}`}
          aria-current={p.id === active ? "page" : undefined}
          data-period-link={p.number}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
            p.id === active ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t(name, { number: p.number })}
          {p.locked && <Lock className="size-3.5" aria-label={t("locked")} />}
        </Link>
      ))}
    </nav>
  );
}
