"use client";

import { useLocale, useTranslations } from "next-intl";

import { EditDeleteMenu } from "@/components/features/setup/edit-delete-menu";
import { studentName } from "@/lib/students/names";
import { deleteStudent } from "@/lib/students/student-actions";
import type { Student } from "@/lib/students/students";

import { StudentDialog, type ClassOption } from "./student-dialog";
import { useStudentsError } from "./use-students-error";

type Props = { student: Student; classes: ClassOption[] | null; yearLabel: string | null };

export function StudentRowActions({ student, classes, yearLabel }: Props) {
  const t = useTranslations("students");
  const locale = useLocale();
  const translateError = useStudentsError();
  const name = studentName(student, locale);

  return (
    <EditDeleteMenu
      label={t("actions", { name })}
      editDialog={(props) => (
        <StudentDialog
          studentId={student.id}
          classes={classes}
          yearLabel={yearLabel}
          defaults={{
            lastName: student.lastName,
            firstName: student.firstName,
            lastNameAr: student.lastNameAr ?? "",
            firstNameAr: student.firstNameAr ?? "",
            birthDate: student.birthDate,
            gender: student.gender,
            codeMassar: student.codeMassar ?? "",
            classId: student.classId ?? "",
          }}
          {...props}
        />
      )}
      deleteTitle={t("delete.title", { name })}
      deleteDescription={t("delete.description")}
      onDelete={() => deleteStudent(student.id)}
      deletedMessage={t("delete.done")}
      translateError={translateError}
    />
  );
}
