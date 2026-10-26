"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { ABSENT_TEXT, columnKey, markKey } from "@/lib/grades/marks";
import { cn } from "@/lib/utils";

import { AverageText } from "./grid-sheet";
import { MarkInput } from "./mark-input";
import type { SheetViewProps } from "./sheet-types";

/**
 * Phones: one contrôle at a time, like the roll call. Chips pick the contrôle
 * (with how many marks it has), then one big row per student: the mark (number
 * keyboard, "Suivant" = next student) and an "Abs" toggle.
 */
export function PhoneSheet({ students, columns, canEdit, cell, setCell, columnLabel, average }: SheetViewProps) {
  const t = useTranslations("grades.sheet");
  const [active, setActive] = useState(0);
  const column = columns[Math.min(active, columns.length - 1)];
  const filled = (i: number) => students.filter((s) => cell(s.id, columns[i]).text.trim() !== "").length;

  return (
    <div className="flex flex-col gap-3" data-phone-sheet>
      <div role="tablist" aria-label={t("pickControl")} className="flex gap-2 overflow-x-auto pb-1">
        {columns.map((c, i) => (
          <button
            key={columnKey(c)}
            type="button"
            role="tab"
            aria-selected={i === active}
            data-chip={columnKey(c)}
            onClick={() => setActive(i)}
            className={cn(
              "flex shrink-0 flex-col items-center rounded-lg border px-3 py-1.5 text-sm transition-colors",
              i === active ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground",
              c.extra && "border-dashed",
            )}
          >
            <span className="font-medium">{columnLabel(c, true)}</span>
            <span className={cn("font-numeric text-xs tabular-nums", i === active ? "text-primary-foreground/80" : "text-muted-foreground")}>
              {filled(i)}/{students.length}
            </span>
          </button>
        ))}
      </div>
      <p className="text-sm font-medium">
        {columnLabel(column, false)}
        {column.extra && <span className="ms-2 text-xs font-normal text-muted-foreground">{t("extraColumn")}</span>}
      </p>
      <ul className="flex flex-col divide-y rounded-lg border bg-card">
        {students.map((s, row) => {
          const c = cell(s.id, column);
          const editable = canEdit && !column.extra;
          const key = markKey(s.id, column.kind, column.number);
          return (
            <li key={s.id} className="flex items-center gap-2 px-3 py-2" data-student={s.id}>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium" dir="auto">{s.name}</span>
                {s.otherName && <span className="truncate text-xs text-muted-foreground" dir="auto">{s.otherName}</span>}
                {average && (
                  <span data-sheet-average={s.id} className="text-xs text-muted-foreground">
                    {t("averageShort")} <span className="font-numeric tabular-nums"><AverageText average={average(s.id)} /></span>
                  </span>
                )}
              </div>
              {editable ? (
                <>
                  <MarkInput
                    cellKey={key}
                    view="phone"
                    row={row}
                    col={0}
                    value={c.text}
                    onChange={(v) => setCell(s.id, column, v)}
                    label={t("cellLabel", { student: s.name, column: columnLabel(column, false) })}
                    changed={c.changed}
                    invalid={c.invalid}
                    absent={c.absent}
                    size="lg"
                  />
                  <button
                    type="button"
                    aria-pressed={c.absent}
                    aria-label={t("absentFor", { student: s.name })}
                    onClick={() => setCell(s.id, column, c.absent ? "" : ABSENT_TEXT)}
                    className={cn(
                      "h-12 min-w-14 rounded-md border px-2 text-sm font-medium transition-colors",
                      c.absent ? "border-warning bg-warning/15 text-foreground" : "bg-background text-muted-foreground",
                    )}
                  >
                    {t("absentShort")}
                  </button>
                </>
              ) : (
                <span className={cn("min-w-16 text-center font-numeric text-lg tabular-nums", c.absent && "text-sm text-muted-foreground")}>
                  {c.absent ? t("absent") : c.text || "—"}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
