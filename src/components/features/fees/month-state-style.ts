import { Ban, CircleCheck, CircleDashed, CircleMinus, CircleX, Clock3, type LucideIcon } from "lucide-react";

import type { MonthState } from "@/lib/fees/ledger";

/** A month's colour + icon, on the staff card and in the parent portal. */
export const MONTH_STATE_STYLE: Record<MonthState, { icon: LucideIcon; className: string }> = {
  paid: { icon: CircleCheck, className: "border-success/40 text-success" },
  partial: { icon: CircleMinus, className: "border-warning/50 text-warning" },
  unpaid: { icon: CircleX, className: "border-danger/40 text-danger" },
  notDue: { icon: Clock3, className: "text-muted-foreground" },
  free: { icon: CircleDashed, className: "text-muted-foreground" },
  cancelled: { icon: Ban, className: "text-muted-foreground line-through" },
};
