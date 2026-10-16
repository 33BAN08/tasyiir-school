"use client";

import { ChevronDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { IMPORT_COLUMNS, REQUIRED_COLUMNS, TEMPLATE_HEADERS } from "@/lib/students/import/columns";

/** Which columns the file needs, and what each one accepts. Folded by default. */
export function ImportColumnsHelp() {
  const t = useTranslations("students.import.help");
  const locale = useLocale() as keyof typeof TEMPLATE_HEADERS;
  const headers = TEMPLATE_HEADERS[locale] ?? TEMPLATE_HEADERS.fr;

  return (
    <details className="group rounded-md border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium">
        {t("title")}
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="flex flex-col gap-3 border-t px-3 py-3 text-sm">
        <p className="text-muted-foreground">{t("intro")}</p>
        <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[auto_1fr]">
          {IMPORT_COLUMNS.map((column) => (
            <div key={column} className="contents">
              <dt className="font-medium">
                <bdi>{headers[column]}</bdi>
                <span className="ms-2 text-xs font-normal text-muted-foreground">
                  {REQUIRED_COLUMNS.includes(column) ? t("required") : t("optional")}
                </span>
              </dt>
              <dd className="text-muted-foreground">{t(`columns.${column}`)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}
