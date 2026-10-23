import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/card";
import { getSchoolUsage } from "@/lib/plan/usage";
import { cn } from "@/lib/utils";

function Meter({ label, used, max }: { label: string; used: number; max: number | null }) {
  const ratio = max ? Math.min(1, used / max) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="font-numeric tabular-nums" dir="ltr">
          {max === null ? used : `${used} / ${max}`}
        </span>
      </div>
      {max !== null && (
        <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className={cn("h-full rounded-full", ratio >= 1 ? "bg-danger" : ratio >= 0.9 ? "bg-warning" : "bg-primary")}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

/** "Votre formule": places used out of places allowed (director's school settings). */
export async function PlanUsageCard() {
  const usage = await getSchoolUsage();
  if (!usage) return null;
  const t = await getTranslations("plan");
  return (
    <Card className="gap-4 p-4" data-plan-usage>
      <div>
        <h2 className="font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <Meter label={t("students")} used={usage.students} max={usage.maxStudents} />
      <Meter label={t("admins")} used={usage.admins} max={usage.maxAdmins} />
    </Card>
  );
}
