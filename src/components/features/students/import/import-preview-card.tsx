"use client";

import { RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ImportPreview, ImportRowPreview, ImportRowStatus } from "@/lib/students/import/types";
import { cn } from "@/lib/utils";

import { ImportPreviewTable } from "./import-preview-table";

const PAGE_SIZE = 100;
type Filter = "all" | ImportRowStatus | "duplicates";

const isDuplicate = (r: ImportRowPreview) => r.status === "ready" && r.warnings.length > 0;

type Props = {
  preview: ImportPreview;
  /** Ready lines the user unticked. */
  excluded: ReadonlySet<number>;
  onExcludedChange: (next: Set<number>) => void;
  pending: boolean;
  onReset: () => void;
  onImport: () => void;
};

/** The checked file: filters, summary, rows (tick boxes), pages, and the import button. */
export function ImportPreviewCard({ preview, excluded, onExcludedChange, pending, onReset, onImport }: Props) {
  const t = useTranslations("students.import");
  const locale = useLocale();
  const [filter, setFilter] = useState<Filter>(
    preview.counts.error > 0 ? "error" : preview.duplicates > 0 ? "duplicates" : "all",
  );
  const [page, setPage] = useState(0);

  const rows = useMemo(
    () =>
      preview.rows.filter((r) =>
        filter === "all" ? true : filter === "duplicates" ? isDuplicate(r) : r.status === filter,
      ),
    [preview, filter],
  );
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const toImport = preview.counts.ready - [...excluded].length;
  const overLimit = preview.placesLeft !== null && toImport > preview.placesLeft;
  const duplicateLines = preview.rows.filter(isDuplicate).map((r) => r.line);
  const allDuplicatesOut = duplicateLines.length > 0 && duplicateLines.every((l) => excluded.has(l));
  const list = (items: string[]) => new Intl.ListFormat(locale, { type: "conjunction" }).format(items);

  const counts: Record<Filter, number> = {
    all: preview.rows.length,
    ...preview.counts,
    duplicates: preview.duplicates,
  };

  function toggle(line: number, include: boolean) {
    const next = new Set(excluded);
    if (include) next.delete(line);
    else next.add(line);
    onExcludedChange(next);
  }

  function setDuplicates(include: boolean) {
    const next = new Set(excluded);
    for (const line of duplicateLines) {
      if (include) next.delete(line);
      else next.add(line);
    }
    onExcludedChange(next);
  }

  return (
    <Card className="py-0">
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "ready", "duplicates", "exists", "error"] as const)
            .filter((f) => f !== "duplicates" || preview.duplicates > 0)
            .map((f) => (
              <Button
                key={f}
                type="button"
                size="sm"
                variant={filter === f ? "default" : "outline"}
                onClick={() => {
                  setFilter(f);
                  setPage(0);
                }}
              >
                {t(`filters.${f}`, { count: counts[f] })}
              </Button>
            ))}
        </div>
        {preview.ignoredHeaders.length > 0 && (
          <p className="text-sm text-muted-foreground">{t("ignoredHeaders", { headers: list(preview.ignoredHeaders) })}</p>
        )}
        <p className={cn("text-sm", preview.counts.error > 0 ? "text-danger" : "text-muted-foreground")}>
          {preview.counts.error > 0
            ? t("summary.fix", { count: preview.counts.error })
            : t("summary.ready", { count: toImport, skipped: preview.counts.exists })}
        </p>
        {overLimit && (
          <p role="alert" className="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
            {t("planLimit", { left: preview.placesLeft ?? 0, count: toImport })}
          </p>
        )}
        {preview.duplicates > 0 && preview.counts.error === 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
            <p className="min-w-0 flex-1">{t("duplicates.explain", { count: preview.duplicates })}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => setDuplicates(allDuplicatesOut)}>
              {allDuplicatesOut ? t("duplicates.tickAll") : t("duplicates.untickAll")}
            </Button>
          </div>
        )}
      </div>
      <ImportPreviewTable
        rows={rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)}
        showArabic={preview.hasArabic}
        showParents={preview.hasParents}
        excluded={excluded}
        onToggle={toggle}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        {pageCount > 1 ? (
          <div className="flex items-center gap-2 text-sm">
            <Button type="button" size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
              {t("pager.previous")}
            </Button>
            <span className="font-numeric tabular-nums">{t("pager.page", { page: page + 1, count: pageCount })}</span>
            <Button type="button" size="sm" variant="outline" disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)}>
              {t("pager.next")}
            </Button>
          </div>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onReset} disabled={pending}>
            <RotateCcw aria-hidden />
            {t("changeFile")}
          </Button>
          <Button type="button" onClick={onImport} disabled={pending || preview.counts.error > 0 || toImport <= 0 || overLimit}>
            {pending ? t("importing") : t("importButton", { count: toImport })}
          </Button>
        </div>
      </div>
    </Card>
  );
}
