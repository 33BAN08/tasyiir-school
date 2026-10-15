import { useLocale, useTranslations } from "next-intl";

import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { studentName, studentOtherName } from "@/lib/students/names";
import type { Student } from "@/lib/students/students";

import type { ClassOption } from "./student-dialog";
import { StudentRowActions } from "./student-row-actions";

type Props = {
  items: Student[];
  /** Row menu (edit / delete) only with students.manage. */
  canManage: boolean;
  classes: ClassOption[] | null;
  yearLabel: string | null;
};

export function StudentsTable({ items, canManage, classes, yearLabel }: Props) {
  const t = useTranslations("students");
  const locale = useLocale();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("columns.name")}</TableHead>
          <TableHead>{t("columns.codeMassar")}</TableHead>
          <TableHead>{t("columns.birthDate")}</TableHead>
          <TableHead>{t("columns.class")}</TableHead>
          {canManage && (
            <TableHead className="w-12">
              <span className="sr-only">{t("columns.actions")}</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((student) => {
          const other = studentOtherName(student, locale);
          return (
            <TableRow key={student.id}>
              <TableCell>
                {/* Each line keeps its own direction and starts at the cell's start. */}
                <div className="flex flex-col items-start">
                  <bdi className="font-medium">{studentName(student, locale)}</bdi>
                  {other && <bdi className="text-xs text-muted-foreground">{other}</bdi>}
                </div>
              </TableCell>
              <TableCell className="font-numeric tabular-nums">
                {student.codeMassar ? <bdi>{student.codeMassar}</bdi> : "—"}
              </TableCell>
              <TableCell className="font-numeric tabular-nums">{formatDate(student.birthDate)}</TableCell>
              <TableCell>
                {student.className ? (
                  <bdi>{student.className}</bdi>
                ) : (
                  <span className="text-muted-foreground">{t("noClass")}</span>
                )}
              </TableCell>
              {canManage && (
                <TableCell className="text-end">
                  <StudentRowActions student={student} classes={classes} yearLabel={yearLabel} />
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function StudentsTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3 p-4">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
