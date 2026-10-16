import { useLocale, useTranslations } from "next-intl";

import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/format";
import { studentInitials, studentName, studentOtherName } from "@/lib/students/names";
import type { Student } from "@/lib/students/students";

import { StudentAvatar } from "./student-avatar";
import type { ClassOption } from "./student-dialog";
import { StudentRowActions } from "./student-row-actions";

type Props = {
  items: Student[];
  /** Row menu (edit / delete) only with students.manage. */
  canManage: boolean;
  classes: ClassOption[] | null;
  yearLabel: string | null;
  schoolId: string;
  /** Signed URLs by photo path (5 minutes). */
  photoUrls: Map<string, string>;
};

export function StudentsTable({ items, canManage, classes, yearLabel, schoolId, photoUrls }: Props) {
  const t = useTranslations("students");
  const tPhoto = useTranslations("students.photo");
  const locale = useLocale();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("columns.name")}</TableHead>
          {/* Phones: name, class and actions only. */}
          <TableHead className="hidden md:table-cell">{t("columns.codeMassar")}</TableHead>
          <TableHead className="hidden md:table-cell">{t("columns.birthDate")}</TableHead>
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
          const name = studentName(student, locale);
          const other = studentOtherName(student, locale);
          const photoUrl = (student.photoPath && photoUrls.get(student.photoPath)) || null;
          return (
            <TableRow key={student.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <StudentAvatar
                    url={photoUrl}
                    initials={studentInitials(student)}
                    alt={tPhoto("alt", { name })}
                  />
                  {/* Each line keeps its own direction and starts at the cell's start. */}
                  <div className="flex flex-col items-start">
                    <Link href={`/students/${student.id}`} className="font-medium underline-offset-4 hover:underline">
                      <bdi>{name}</bdi>
                    </Link>
                    {other && <bdi className="text-xs text-muted-foreground">{other}</bdi>}
                  </div>
                </div>
              </TableCell>
              <TableCell className="hidden font-numeric tabular-nums md:table-cell">
                {student.codeMassar ? <bdi>{student.codeMassar}</bdi> : "—"}
              </TableCell>
              <TableCell className="hidden font-numeric tabular-nums md:table-cell">{formatDate(student.birthDate)}</TableCell>
              <TableCell>
                {student.className ? (
                  <bdi>{student.className}</bdi>
                ) : (
                  <span className="text-muted-foreground">{t("noClass")}</span>
                )}
              </TableCell>
              {canManage && (
                <TableCell className="text-end">
                  <StudentRowActions
                    student={student}
                    classes={classes}
                    yearLabel={yearLabel}
                    schoolId={schoolId}
                    photoUrl={photoUrl}
                  />
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
