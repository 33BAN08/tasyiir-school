"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { EMPTY_STUDENT, StudentDialog, type ClassOption } from "./student-dialog";

type Props = { classes: ClassOption[] | null; yearLabel: string | null };

export function NewStudentButton({ classes, yearLabel }: Props) {
  const t = useTranslations("students");
  const [open, setOpen] = useState(false);

  return (
    <StudentDialog
      classes={classes}
      yearLabel={yearLabel}
      defaults={EMPTY_STUDENT}
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button>
          <Plus aria-hidden />
          {t("new")}
        </Button>
      }
    />
  );
}
