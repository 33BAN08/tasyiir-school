import { Ban, CheckCircle2, Clock, PauseCircle, XCircle, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SchoolStatus, SubscriptionStatus } from "@/lib/validations/platform";

// Status = colored icon + text label (docs/DESIGN.md: never color alone).
type Tone = "success" | "danger" | "warning" | "info";

const TONE_ICON: Record<Tone, string> = {
  success: "text-success",
  danger: "text-danger",
  warning: "text-warning",
  info: "text-info",
};

function StatusBadge({ tone, icon: Icon, label }: { tone: Tone; icon: LucideIcon; label: string }) {
  return (
    <Badge variant="outline">
      <Icon className={cn(TONE_ICON[tone])} aria-hidden />
      {label}
    </Badge>
  );
}

const SCHOOL: Record<SchoolStatus, { tone: Tone; icon: LucideIcon }> = {
  active: { tone: "success", icon: CheckCircle2 },
  suspended: { tone: "danger", icon: Ban },
};

export function SchoolStatusBadge({ status }: { status: SchoolStatus }) {
  const t = useTranslations("platform.schoolStatus");
  return <StatusBadge {...SCHOOL[status]} label={t(status)} />;
}

const SUBSCRIPTION: Record<SubscriptionStatus, { tone: Tone; icon: LucideIcon }> = {
  trial: { tone: "info", icon: Clock },
  active: { tone: "success", icon: CheckCircle2 },
  suspended: { tone: "warning", icon: PauseCircle },
  expired: { tone: "danger", icon: XCircle },
};

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  const t = useTranslations("platform.subscriptionStatus");
  return <StatusBadge {...SUBSCRIPTION[status]} label={t(status)} />;
}
