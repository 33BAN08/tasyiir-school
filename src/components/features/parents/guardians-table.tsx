import { useLocale, useTranslations } from "next-intl";

import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { Guardian } from "@/lib/parents/guardians";
import { formatMobile } from "@/lib/parents/phone";
import { studentName } from "@/lib/students/names";

import { AccountStatusBadge } from "./account-status-badge";

export function GuardiansTable({ items }: { items: Guardian[] }) {
  const t = useTranslations("parents");
  const locale = useLocale();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("columns.name")}</TableHead>
          <TableHead>{t("columns.phone")}</TableHead>
          <TableHead>{t("columns.children")}</TableHead>
          <TableHead>{t("columns.account")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((g) => (
          <TableRow key={g.id}>
            <TableCell>
              <Link href={`/parents/${g.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                <bdi>
                  {g.lastName} {g.firstName}
                </bdi>
              </Link>
            </TableCell>
            <TableCell className="font-numeric tabular-nums">
              <bdi>{formatMobile(g.phone)}</bdi>
            </TableCell>
            <TableCell className="max-w-72">
              {g.children.length === 0 ? (
                <span className="text-muted-foreground">{t("noChildren")}</span>
              ) : (
                <span className="flex flex-wrap gap-x-3 gap-y-1">
                  {g.children.map((c) => (
                    <bdi key={c.studentId}>{studentName(c, locale)}</bdi>
                  ))}
                </span>
              )}
            </TableCell>
            <TableCell>
              <AccountStatusBadge status={g.account} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function GuardiansTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3 p-4">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
