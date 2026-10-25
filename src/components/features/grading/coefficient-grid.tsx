"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useRouter } from "@/i18n/navigation";
import { saveCoefficientGrid } from "@/lib/grading/coefficient-actions";
import type { SubjectColor } from "@/lib/structure/subject-template";
import { cn } from "@/lib/utils";

import { GridCell } from "./grid-cell";
import {
  EMPTY,
  buildColumns,
  cellKey,
  columnKey,
  initialCells,
  initialOrder,
  pendingCells,
  type CellDraft,
  type GridLevel,
  type GridRow,
  type GridView,
} from "./grid-model";
import { GridSubjectCell } from "./grid-subject-cell";
import { useGradingError } from "./use-grading-error";

type Props = {
  yearId: string;
  levels: GridLevel[];
  subjects: { id: string; name: string; color: SubjectColor }[];
  rows: GridRow[];
  canManage: boolean;
};

/**
 * Coefficients of one cycle: a row per subject, a column per level (+ one per
 * filière of a level that has some). Edits stay in the page until
 * "Enregistrer", which sends every changed cell in one transaction.
 */
export function CoefficientGrid({ yearId, levels, subjects, rows, canManage }: Props) {
  const t = useTranslations("grading.grid");
  const translateError = useGradingError();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const columns = useMemo(() => buildColumns(levels), [levels]);
  const initial = useMemo(() => initialCells(rows), [rows]);
  const startOrder = useMemo(() => initialOrder(subjects, rows), [subjects, rows]);
  const positions = useMemo(
    () => Object.fromEntries(rows.map((r) => [cellKey(columnKey(r.levelId, r.trackId), r.subjectId), r.position])),
    [rows],
  );
  const [draft, setDraft] = useState<Record<string, CellDraft>>(initial);
  const [order, setOrder] = useState(startOrder);
  const [view, setView] = useState<GridView>("coefficients");
  const [failedCell, setFailedCell] = useState<string | null>(null);
  const reordered = order.join() !== startOrder.join();
  const { cells, invalid } = useMemo(
    () => pendingCells(columns, order, initial, draft, positions, reordered),
    [columns, order, initial, draft, positions, reordered],
  );
  const dirty = cells.length + invalid.size > 0;
  const byId = new Map(subjects.map((s) => [s.id, s]));

  // Leaving with unsaved cells: the browser asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const get = (key: string) => draft[key] ?? EMPTY;
  const field = view === "coefficients" ? "coefficient" : "controls";
  const setCell = (key: string, value: string) => {
    setFailedCell(null);
    setDraft((d) => ({ ...d, [key]: { ...(d[key] ?? EMPTY), [field]: value } }));
  };
  const sameForAll = (subjectId: string, value: string) => {
    setFailedCell(null);
    setDraft((d) => {
      const next = { ...d };
      for (const col of columns.filter((c) => c.commonKey === null)) {
        const key = cellKey(col.key, subjectId);
        const cell = next[key] ?? EMPTY;
        // Contrôles only where the subject is graded.
        if (field === "controls" && cell.coefficient.trim() === "") continue;
        next[key] = { ...cell, [field]: value };
      }
      return next;
    });
  };
  const move = (index: number, by: -1 | 1) =>
    setOrder((o) => {
      const next = [...o];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });

  function save() {
    startTransition(async () => {
      const result = await saveCoefficientGrid(yearId, cells);
      if (!result.ok) {
        setFailedCell(result.cell ?? null);
        toast.error(translateError(result.error));
        return;
      }
      toast.success(t("saved", { count: cells.length }));
      router.refresh();
    });
  }

  function cancel() {
    setDraft(initial);
    setOrder(startOrder);
    setFailedCell(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label={t("viewLabel")} className="flex w-fit gap-1 rounded-lg bg-muted p-1">
          {(["coefficients", "controls"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                view === v ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`views.${v}`)}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{t(view === "coefficients" ? "hintCoefficients" : "hintControls")}</p>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <div className="overflow-x-auto">
          <table className="w-max min-w-full border-collapse text-sm" data-grid-view={view}>
            <thead>
              <tr className="border-b">
                <th scope="col" className="sticky start-0 z-10 bg-card px-2 py-2 text-start text-xs font-medium text-muted-foreground">
                  {t("subject")}
                </th>
                {columns.map((col) => (
                  <th key={col.key} scope="col" data-column={col.key}
                    className={cn("px-1 py-2 text-center text-xs", col.trackName ? "font-normal text-muted-foreground" : "font-semibold")}>
                    {col.trackName ? (
                      <span className="flex flex-col leading-tight">
                        <span>{col.levelName}</span>
                        <span className="max-w-24 truncate" title={col.trackName}>{col.trackName}</span>
                      </span>
                    ) : (
                      col.levelName
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {order.map((subjectId, index) => {
                const subject = byId.get(subjectId);
                if (!subject) return null;
                return (
                  <tr key={subjectId}>
                    <GridSubjectCell
                      subject={subject}
                      view={view}
                      canManage={canManage}
                      onUp={index > 0 ? () => move(index, -1) : null}
                      onDown={index < order.length - 1 ? () => move(index, 1) : null}
                      onSameForAll={(value) => sameForAll(subjectId, value)}
                    />
                    {columns.map((col) => {
                      const key = cellKey(col.key, subjectId);
                      const cell = get(key);
                      const common = col.commonKey ? get(cellKey(col.commonKey, subjectId)) : null;
                      const graded = cell.coefficient.trim() !== "";
                      const value = view === "coefficients" ? cell.coefficient : graded ? cell.controls : "";
                      const placeholder =
                        view === "coefficients"
                          ? common?.coefficient.trim() || "—"
                          : graded || common?.coefficient.trim()
                            ? (common && !graded ? common.controls.trim() : "") || String(col.levelControls)
                            : "—";
                      const before = initial[key] ?? EMPTY;
                      return (
                        <GridCell
                          key={col.key}
                          cellKey={key}
                          view={view}
                          value={value}
                          placeholder={placeholder}
                          changed={cell.coefficient.trim() !== before.coefficient || cell.controls.trim() !== before.controls}
                          invalid={invalid.has(key) || failedCell === key}
                          disabled={view === "controls" && !graded}
                          canManage={canManage}
                          label={t("cellLabel", {
                            subject: subject.name,
                            column: col.trackName ? `${col.levelName} · ${col.trackName}` : col.levelName,
                          })}
                          onChange={(v) => setCell(key, v)}
                        />
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {canManage && dirty && (
        <div
          data-grid-savebar
          className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-md"
        >
          <div className="flex flex-col text-sm">
            <span className="font-medium">{t("pending", { count: cells.length + invalid.size })}</span>
            {invalid.size > 0 && <span className="text-destructive">{t("invalidCells", { count: invalid.size })}</span>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={cancel} disabled={isPending}>
              {t("cancel")}
            </Button>
            <Button onClick={save} disabled={isPending || invalid.size > 0 || cells.length === 0}>
              {isPending ? t("saving") : t("save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
