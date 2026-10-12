import { Ban, CheckCircle2, Clock, PauseCircle, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import { StatusBadge, type StatusStyle } from "@/components/layout/status-badge";
import type { SchoolStatus, SubscriptionStatus } from "@/lib/validations/platform";

const SCHOOL: Record<SchoolStatus, StatusStyle> = {
  active: { tone: "success", icon: CheckCircle2 },
  suspended: { tone: "danger", icon: Ban },
};

export function SchoolStatusBadge({ status }: { status: SchoolStatus }) {
  const t = useTranslations("platform.schoolStatus");
  return <StatusBadge {...SCHOOL[status]} label={t(status)} />;
}

const SUBSCRIPTION: Record<SubscriptionStatus, StatusStyle> = {
  trial: { tone: "info", icon: Clock },
  active: { tone: "success", icon: CheckCircle2 },
  suspended: { tone: "warning", icon: PauseCircle },
  expired: { tone: "danger", icon: XCircle },
};

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  const t = useTranslations("platform.subscriptionStatus");
  return <StatusBadge {...SUBSCRIPTION[status]} label={t(status)} />;
}
