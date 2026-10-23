import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  label: string;
  value: string;
  icon: LucideIcon;
  hint?: string;
  /** Stat name + raw number as data attributes (read by the test suites). */
  stat?: { name: string; raw: number };
};

/** KPI tile: label, one value, optional hint. Values use text colors only. */
export function StatCard({ label, value, icon: Icon, hint, stat }: Props) {
  return (
    <Card data-stat={stat?.name} data-value={stat?.raw}>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{label}</p>
          <Icon className="size-4 text-muted-foreground" aria-hidden />
        </div>
        {/* <bdi>: "1 250,00 DH" stays in order inside RTL text, alignment stays at start. */}
        <p className="font-numeric text-2xl font-semibold">
          <bdi>{value}</bdi>
        </p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-16" />
      </CardContent>
    </Card>
  );
}
