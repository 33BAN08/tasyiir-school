"use client";

import { Download } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { IMPORT_COLUMNS, TEMPLATE_HEADERS, type ImportColumn } from "@/lib/students/import/columns";

const WIDTHS: Partial<Record<ImportColumn, number>> = { birthDate: 24, parentPhone: 18, parentRelation: 24 };

/**
 * The import template (.xlsx), made in the browser: the header row in the UI
 * language and one example row (a class of the school when there is one).
 * The library is only loaded on click.
 */
export function ImportTemplateButton({ exampleClass }: { exampleClass: string | null }) {
  const t = useTranslations("students.import.template");
  const locale = useLocale() as keyof typeof TEMPLATE_HEADERS;
  const [isPending, startTransition] = useTransition();

  function download() {
    startTransition(async () => {
      try {
        const { default: writeExcelFile } = await import("write-excel-file/browser");
        const headers = TEMPLATE_HEADERS[locale] ?? TEMPLATE_HEADERS.fr;
        const example: Record<ImportColumn, string | Date> = {
          lastName: "Benali",
          firstName: "Amine",
          lastNameAr: "بنعلي",
          firstNameAr: "أمين",
          birthDate: new Date(Date.UTC(2014, 2, 2)),
          gender: t("exampleGender"),
          codeMassar: "J130012345",
          className: exampleClass ?? "1AC-A",
          parentLastName: "Benali",
          parentFirstName: "Mohammed",
          parentPhone: "06 12 34 56 78",
          parentRelation: t("exampleRelation"),
        };
        const sheet = [
          IMPORT_COLUMNS.map((c) => ({ value: headers[c], fontWeight: "bold" as const })),
          IMPORT_COLUMNS.map((c) => {
            const value = example[c];
            return value instanceof Date
              ? { value, type: Date, format: "dd/mm/yyyy" }
              : { value, type: String };
          }),
        ];
        await writeExcelFile(sheet, {
          columns: IMPORT_COLUMNS.map((c) => ({ width: WIDTHS[c] ?? 20 })),
        }).toFile(t("fileName"));
      } catch {
        toast.error(t("failed"));
      }
    });
  }

  return (
    <Button type="button" variant="outline" onClick={download} disabled={isPending}>
      <Download aria-hidden />
      {t("button")}
    </Button>
  );
}
