"use client";

import { useTranslations } from "next-intl";

import { ListFilters } from "@/components/layout/list-filters";
import { NO_CLASS } from "@/lib/validations/students";

import type { ClassOption } from "./student-dialog";

/** `classes`: the current year's classes; null hides the class filter (no current year). */
export function StudentsFilters({ classes }: { classes: ClassOption[] | null }) {
  const t = useTranslations("students");

  return (
    <ListFilters
      searchLabel={t("searchLabel")}
      searchPlaceholder={t("searchPlaceholder")}
      loadingLabel={t("loading")}
      selects={
        classes
          ? [
              {
                param: "class",
                label: t("classFilterLabel"),
                allLabel: t("classAll"),
                options: [
                  ...classes.map((c) => ({ value: c.id, label: c.name })),
                  { value: NO_CLASS, label: t("noClass") },
                ],
              },
            ]
          : []
      }
    />
  );
}
