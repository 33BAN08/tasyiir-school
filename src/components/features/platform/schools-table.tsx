import { useTranslations } from "next-intl";

import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import type { SchoolListItem } from "@/lib/platform/schools";

import { SchoolStatusBadge, SubscriptionStatusBadge } from "./status-badges";

export function SchoolsTable({ items }: { items: SchoolListItem[] }) {
  const t = useTranslations("platform.schools.columns");
  const tSchools = useTranslations("platform.schools");

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("name")}</TableHead>
          <TableHead>{t("city")}</TableHead>
          <TableHead>{t("plan")}</TableHead>
          <TableHead>{t("subscription")}</TableHead>
          <TableHead>{t("status")}</TableHead>
          <TableHead>{t("createdAt")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((school) => (
          <TableRow key={school.id}>
            <TableCell>
              <div className="flex flex-col">
                <span className="font-medium">{school.name}</span>
                <span className="text-xs text-muted-foreground">
                  <bdi>{school.slug}</bdi>
                </span>
              </div>
            </TableCell>
            <TableCell>{school.city ?? "—"}</TableCell>
            <TableCell>{school.subscription?.planName ?? "—"}</TableCell>
            <TableCell>
              {school.subscription ? (
                <SubscriptionStatusBadge status={school.subscription.status} />
              ) : (
                <span className="text-sm text-muted-foreground">{tSchools("noSubscription")}</span>
              )}
            </TableCell>
            <TableCell>
              <SchoolStatusBadge status={school.status} />
            </TableCell>
            <TableCell className="font-numeric tabular-nums">{formatDate(school.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function SchoolsTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3 p-4">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
