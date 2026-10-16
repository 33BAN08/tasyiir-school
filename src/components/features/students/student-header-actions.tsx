"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDeleteDialog } from "@/components/features/setup/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { deleteStudent } from "@/lib/students/student-actions";
import type { StudentFormValues } from "@/lib/validations/students";

import { StudentDialog, type ClassOption } from "./student-dialog";
import { useStudentsError } from "./use-students-error";

type Props = {
  studentId: string;
  name: string;
  defaults: StudentFormValues;
  classes: ClassOption[] | null;
  yearLabel: string | null;
  photo: { schoolId: string; name: string; initials: string; url: string | null };
};

/** Edit (dialog) and delete (confirmation, then back to the list). */
export function StudentHeaderActions({ studentId, name, defaults, classes, yearLabel, photo }: Props) {
  const t = useTranslations("students");
  const translateError = useStudentsError();
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const [isPending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deleteStudent(studentId);
      setDialog(null);
      if (!result.ok) {
        toast.error(translateError(result.error));
        return;
      }
      toast.success(t("delete.done"));
      router.push("/students");
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => setDialog("edit")}>
        <Pencil aria-hidden />
        {t("detail.edit")}
      </Button>
      <Button variant="outline" onClick={() => setDialog("delete")}>
        <Trash2 aria-hidden />
        {t("detail.delete")}
      </Button>
      <StudentDialog
        studentId={studentId}
        defaults={defaults}
        classes={classes}
        yearLabel={yearLabel}
        photo={photo}
        open={dialog === "edit"}
        onOpenChange={(open) => !open && setDialog(null)}
      />
      <ConfirmDeleteDialog
        open={dialog === "delete"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t("delete.title", { name })}
        description={t("delete.description")}
        pending={isPending}
        onConfirm={remove}
      />
    </div>
  );
}
