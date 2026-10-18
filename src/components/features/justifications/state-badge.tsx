import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import type { JustificationState } from "@/lib/justifications/coverage";
import { cn } from "@/lib/utils";

const STYLE = {
  justified: { icon: CheckCircle2, className: "border-success/40 bg-success/10 text-success" },
  pending: { icon: Clock, className: "border-warning/40 bg-warning/10 text-warning" },
  rejected: { icon: XCircle, className: "border-danger/40 bg-danger/10 text-danger" },
} as const;

/** Where a justification stands: icon + words (never colour alone). Nothing for an absence nobody has justified. */
export function StateBadge({ state }: { state: JustificationState }) {
  const t = useTranslations("portal.absences.state");
  if (state === "none") return null;
  const { icon: Icon, className } = STYLE[state];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", className)}>
      <Icon className="size-3.5" aria-hidden />
      {t(state)}
    </span>
  );
}
