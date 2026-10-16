import { Ban, CheckCircle2, Clock, MinusCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import { StatusBadge, type StatusStyle } from "@/components/layout/status-badge";
import type { AccountStatus } from "@/lib/parents/guardians";

const STYLES: Record<AccountStatus, StatusStyle> = {
  none: { tone: "muted", icon: MinusCircle },
  pending: { tone: "warning", icon: Clock },
  active: { tone: "success", icon: CheckCircle2 },
  deactivated: { tone: "danger", icon: Ban },
};

export function AccountStatusBadge({ status }: { status: AccountStatus }) {
  const t = useTranslations("parents.account.status");
  return <StatusBadge {...STYLES[status]} label={t(status)} />;
}
