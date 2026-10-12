import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { roleLabel } from "@/lib/auth/roles";
import { formatDate } from "@/lib/format";
import type { StaffMember } from "@/lib/staff/staff";

import { StaffStatusBadge } from "./staff-status-badge";

type Props = { items: StaffMember[]; currentUserId: string };

export function StaffTable({ items, currentUserId }: Props) {
  const t = useTranslations("staff");
  const tRoles = useTranslations("roles");

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("columns.name")}</TableHead>
          <TableHead>{t("columns.email")}</TableHead>
          <TableHead>{t("columns.phone")}</TableHead>
          <TableHead>{t("columns.role")}</TableHead>
          <TableHead>{t("columns.status")}</TableHead>
          <TableHead>{t("columns.createdAt")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((member) => (
          <TableRow key={member.id}>
            <TableCell>
              <span className="flex items-center gap-2">
                <Link
                  href={`/staff/${member.id}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {member.fullName}
                </Link>
                {member.id === currentUserId && <Badge variant="secondary">{t("you")}</Badge>}
              </span>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {member.email ? <bdi className="break-all">{member.email}</bdi> : "—"}
            </TableCell>
            <TableCell className="font-numeric tabular-nums">
              {member.phone ? <bdi>{member.phone}</bdi> : "—"}
            </TableCell>
            <TableCell>{roleLabel(member.role, tRoles)}</TableCell>
            <TableCell>
              <StaffStatusBadge status={member.status} />
            </TableCell>
            <TableCell className="font-numeric tabular-nums">{formatDate(member.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function StaffTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3 p-4">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
