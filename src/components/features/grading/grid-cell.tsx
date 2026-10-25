"use client";

import { cn } from "@/lib/utils";

import type { GridView } from "./grid-model";

type Props = {
  cellKey: string;
  view: GridView;
  /** What the cell holds now (coefficient or contrôles, by view). */
  value: string;
  /** Shown greyed when empty: the inherited / default value, or "—". */
  placeholder: string;
  changed: boolean;
  invalid: boolean;
  /** No row here (contrôles view of a subject not graded in this column). */
  disabled: boolean;
  canManage: boolean;
  label: string;
  onChange: (value: string) => void;
};

/** One cell of the coefficient grid: an input for grades.manage, plain text otherwise. */
export function GridCell({ cellKey, view, value, placeholder, changed, invalid, disabled, canManage, label, onChange }: Props) {
  if (!canManage) {
    return (
      <td data-cell={cellKey} className="px-1 py-1.5 text-center">
        <span className={cn("font-numeric tabular-nums text-sm", !value && "text-muted-foreground")}>{value || placeholder}</span>
      </td>
    );
  }
  return (
    <td data-cell={cellKey} data-changed={changed} className="px-1 py-1.5 text-center">
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={label}
        aria-invalid={invalid || undefined}
        inputMode={view === "controls" ? "numeric" : "decimal"}
        autoComplete="off"
        className={cn(
          "h-9 w-16 rounded-md border border-input bg-background px-1 text-center font-numeric text-sm tabular-nums outline-none",
          "placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:bg-muted/50",
          changed && "border-primary bg-primary/10",
          invalid &&
            "border-destructive bg-destructive/10 ring-3 ring-destructive/20 focus-visible:border-destructive focus-visible:ring-destructive/30",
        )}
      />
    </td>
  );
}
