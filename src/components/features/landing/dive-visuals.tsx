import { ArrowDownToLine, Ban } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

// The picture next to the timetable deep dive (demo data, aria-hidden).

const CARD = "rounded-2xl border border-lp-line bg-lp-surface p-5 shadow-sm";

export function TimetableVisual() {
  const t = useTranslations("landing.hero.timetable");
  const cells = [
    { label: t("arabic"), tone: "bg-lp-tint text-lp-brand" },
    { label: t("maths"), tone: "border-2 border-dashed border-lp-brand bg-lp-surface text-lp-brand", icon: ArrowDownToLine },
    { label: t("french"), tone: "bg-lp-tint text-lp-brand" },
    { label: t("maths"), tone: "border-2 border-dashed border-lp-absent bg-lp-absent-bg text-lp-absent", icon: Ban },
  ];
  return (
    <div aria-hidden className={CARD}>
      <div className="grid grid-cols-2 gap-2">
        {cells.map((cell, i) => (
          <div key={i} className={cn("flex h-16 items-center justify-center gap-1.5 rounded-lg text-sm font-bold", cell.tone)}>
            {cell.icon && <cell.icon className="size-4" />}
            {cell.label}
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm font-bold text-lp-absent">{t("refused")}</p>
    </div>
  );
}
