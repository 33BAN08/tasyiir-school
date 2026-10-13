import { CalendarClock, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { StatusBadge } from "@/components/layout/status-badge";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import type { AcademicYear, YearStatus } from "@/lib/structure/academic-years";

import { YearRowActions } from "./year-row-actions";

function YearStatusBadge({ status }: { status: YearStatus }) {
  const t = useTranslations("setup.years.status");
  if (status === "current") return <StatusBadge tone="success" icon={CheckCircle2} label={t("current")} />;
  if (status === "upcoming") return <StatusBadge tone="info" icon={CalendarClock} label={t("upcoming")} />;
  return <Badge variant="secondary">{t(status)}</Badge>;
}

export function YearsTable({ years }: { years: AcademicYear[] }) {
  const t = useTranslations("setup.years.columns");

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("label")}</TableHead>
          <TableHead>{t("startDate")}</TableHead>
          <TableHead>{t("endDate")}</TableHead>
          <TableHead>{t("status")}</TableHead>
          <TableHead className="w-12">
            <span className="sr-only">{t("actions")}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {years.map((year) => (
          <TableRow key={year.id}>
            <TableCell className="font-medium">{year.label}</TableCell>
            <TableCell className="font-numeric tabular-nums">{formatDate(year.startDate)}</TableCell>
            <TableCell className="font-numeric tabular-nums">{formatDate(year.endDate)}</TableCell>
            <TableCell>
              <YearStatusBadge status={year.status} />
            </TableCell>
            <TableCell className="text-end">
              <YearRowActions year={year} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
