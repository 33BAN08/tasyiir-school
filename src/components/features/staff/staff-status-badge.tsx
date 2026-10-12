import { Ban, CheckCircle2, Clock } from "lucide-react";
import { useTranslations } from "next-intl";

import { StatusBadge, type StatusStyle } from "@/components/layout/status-badge";
import type { StaffStatus } from "@/lib/validations/staff";

const STAFF: Record<StaffStatus, StatusStyle> = {
  active: { tone: "success", icon: CheckCircle2 },
  pending: { tone: "warning", icon: Clock },
  deactivated: { tone: "danger", icon: Ban },
};

export function StaffStatusBadge({ status }: { status: StaffStatus }) {
  const t = useTranslations("staff.status");
  return <StatusBadge {...STAFF[status]} label={t(status)} />;
}
