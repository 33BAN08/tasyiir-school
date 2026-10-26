"use client";

import { useTranslations } from "next-intl";

import { Card } from "@/components/ui/card";
import { columnKey, markKey } from "@/lib/grades/marks";
import { cn } from "@/lib/utils";

import { MarkInput } from "./mark-input";
import type { SheetAverage, SheetViewProps } from "./sheet-types";

/**
 * Tablets and computers: the whole sheet, students in rows, contrôles in
 * columns. Enter = the same contrôle for the next student; "a" / "abs" = absent.
 */
export function GridSheet({ students, columns, canEdit, cell, setCell, columnLabel, average }: SheetViewProps) {
  const t = useTranslations("grades.sheet");
  return (
    <Card className="gap-0 overflow-hidden py-0" data-grid-sheet>
      <div className="overflow-x-auto">
        <table className="w-max min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b">
              <th scope="col" className="sticky start-0 z-10 bg-card px-3 py-2 text-start text-xs font-medium text-muted-foreground">
                {t("student")}
              </th>
              {columns.map((c) => (
                <th key={columnKey(c)} scope="col" className={cn("px-1 py-2 text-center text-xs", c.extra ? "font-normal text-muted-foreground" : "font-semibold")}>
                  {columnLabel(c, false)}
                  {c.extra && <span className="block font-normal">{t("extraColumn")}</span>}
                </th>
              ))}
              {average && (
                <th scope="col" className="bg-muted/50 px-3 py-2 text-center text-xs font-semibold">{t("average")}</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {students.map((s, row) => (
              <tr key={s.id} data-student={s.id}>
                <th scope="row" className="sticky start-0 z-10 bg-card px-3 py-1.5 text-start font-normal shadow-[inset_-1px_0_0_var(--color-border)] rtl:shadow-[inset_1px_0_0_var(--color-border)]">
                  <span className="block max-w-56 truncate font-medium" dir="auto">{s.name}</span>
                  {s.otherName && <span className="block max-w-56 truncate text-xs text-muted-foreground" dir="auto">{s.otherName}</span>}
                </th>
                {columns.map((col, i) => {
                  const c = cell(s.id, col);
                  const key = markKey(s.id, col.kind, col.number);
                  return (
                    <td key={columnKey(col)} className="px-1 py-1.5 text-center">
                      {canEdit && !col.extra ? (
                        <MarkInput
                          cellKey={key}
                          view="grid"
                          row={row}
                          col={i}
                          value={c.text}
                          onChange={(v) => setCell(s.id, col, v)}
                          label={t("cellLabel", { student: s.name, column: columnLabel(col, false) })}
                          changed={c.changed}
                          invalid={c.invalid}
                          absent={c.absent}
                          size="sm"
                        />
                      ) : (
                        <span data-mark-text={key} className={cn("font-numeric tabular-nums", (c.absent || !c.text) && "text-muted-foreground")}>
                          {c.absent ? t("absentShort") : c.text || "—"}
                        </span>
                      )}
                    </td>
                  );
                })}
                {average && (
                  <td data-sheet-average={s.id} className="bg-muted/50 px-3 py-1.5 text-center font-numeric tabular-nums">
                    <AverageText average={average(s.id)} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** "12,25 · 2/3" + a muted "incomplet" while partly entered; the average alone when complete; a muted "—" before any mark (shared with the phone view). */
export function AverageText({ average: a }: { average: SheetAverage }) {
  const t = useTranslations("grades.sheet");
  return (
    <>
      <span data-sheet-average-value className={a.value === null ? "text-muted-foreground" : "font-semibold"}>{a.value ?? "—"}</span>
      {a.count && (
        <>
          <span data-sheet-count={a.count} className="ms-1 text-xs text-muted-foreground">{a.count}</span>
          <span data-incomplete className="block text-[10px] text-muted-foreground">{t("incomplete")}</span>
        </>
      )}
    </>
  );
}
