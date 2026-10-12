import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Status = colored icon + text label (docs/DESIGN.md: never color alone).
export type Tone = "success" | "danger" | "warning" | "info";

const TONE_ICON: Record<Tone, string> = {
  success: "text-success",
  danger: "text-danger",
  warning: "text-warning",
  info: "text-info",
};

export type StatusStyle = { tone: Tone; icon: LucideIcon };

export function StatusBadge({ tone, icon: Icon, label }: StatusStyle & { label: string }) {
  return (
    <Badge variant="outline">
      <Icon className={cn(TONE_ICON[tone])} aria-hidden />
      {label}
    </Badge>
  );
}
