import { useTranslations } from "next-intl";

import { StaffStatusBadge } from "@/components/features/staff/staff-status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { Subject } from "@/lib/structure/subjects";
import type { Teacher } from "@/lib/teachers/teachers";

import { SubjectChip } from "./subject-chip";
import { TeacherSubjectsDialog } from "./teacher-subjects-dialog";

type Props = {
  items: Teacher[];
  /** Every subject of the school (choices in the dialog). */
  subjects: Subject[];
  /** users.view: the name opens the staff page of the account. */
  canOpenStaff: boolean;
};

export function TeachersTable({ items, subjects, canOpenStaff }: Props) {
  const t = useTranslations("teachers");

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("columns.name")}</TableHead>
          <TableHead>{t("columns.subjects")}</TableHead>
          <TableHead className="hidden md:table-cell">{t("columns.status")}</TableHead>
          <TableHead className="w-12">
            <span className="sr-only">{t("columns.actions")}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((teacher) => (
          <TableRow key={teacher.id}>
            <TableCell>
              <div className="flex flex-col items-start">
                {canOpenStaff ? (
                  <Link href={`/staff/${teacher.id}`} className="font-medium underline-offset-4 hover:underline">
                    <bdi>{teacher.fullName}</bdi>
                  </Link>
                ) : (
                  <bdi className="font-medium">{teacher.fullName}</bdi>
                )}
                {teacher.email && (
                  <bdi dir="ltr" className="hidden text-xs text-muted-foreground md:block">
                    {teacher.email}
                  </bdi>
                )}
              </div>
            </TableCell>
            <TableCell className="whitespace-normal">
              {teacher.subjects.length === 0 ? (
                <span className="text-sm text-muted-foreground">{t("noSubjects")}</span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {teacher.subjects.map((s) => (
                    <SubjectChip key={s.id} subject={s} />
                  ))}
                </div>
              )}
            </TableCell>
            <TableCell className="hidden md:table-cell">
              <StaffStatusBadge status={teacher.status} />
            </TableCell>
            <TableCell className="text-end">
              {subjects.length > 0 && (
                <TeacherSubjectsDialog
                  teacherId={teacher.id}
                  teacherName={teacher.fullName}
                  subjects={subjects}
                  selectedIds={teacher.subjects.map((s) => s.id)}
                />
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
