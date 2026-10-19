import { Award, Backpack, BookX, TriangleAlert, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { RemarkType } from "@/lib/validations/remarks";

export const REMARK_ICONS: Record<RemarkType, LucideIcon> = {
  behavior: TriangleAlert,
  homework: BookX,
  material: Backpack,
  praise: Award,
};

/** Text colour per type: praise is good news, the rest calls for attention. */
export const REMARK_TONE: Record<RemarkType, string> = {
  behavior: "text-danger",
  homework: "text-warning",
  material: "text-warning",
  praise: "text-success",
};

/** Icon + the type's name ("Comportement", "Félicitations", …): never colour alone. */
export function RemarkTypeBadge({ type, className }: { type: RemarkType; className?: string }) {
  const t = useTranslations("remarks.types");
  const Icon = REMARK_ICONS[type];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", REMARK_TONE[type], className)}>
      <Icon className="size-4 shrink-0" aria-hidden />
      {t(type)}
    </span>
  );
}
