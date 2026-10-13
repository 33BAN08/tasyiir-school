"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { AcademicYearFormValues } from "@/lib/validations/structure";

import { YearDialog } from "./year-dialog";

/** "New year", pre-filled with the suggested Moroccan school year (September → June). */
export function NewYearButton({ suggestion }: { suggestion: AcademicYearFormValues }) {
  const t = useTranslations("setup.years");
  const [open, setOpen] = useState(false);

  return (
    <YearDialog
      defaults={suggestion}
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
