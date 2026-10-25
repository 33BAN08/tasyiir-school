"use client";

import { cn } from "@/lib/utils";

type Props = {
  /** Cell key (student|kind|number), for tests and "next cell" moves. */
  cellKey: string;
  /** Which view the input belongs to ("phone" | "grid"), its row and column (Enter = next row, same column). */
  view: "phone" | "grid";
  row: number;
  col: number;
  value: string;
  onChange: (value: string) => void;
  label: string;
  changed: boolean;
  invalid: boolean;
  absent: boolean;
  size: "lg" | "sm";
};

/** Focus the same column one row down (the keyboard's "Suivant" / Enter). */
function focusNext(view: string, row: number, col: number) {
  const next = document.querySelector<HTMLInputElement>(`[data-mark-view="${view}"][data-row="${row + 1}"][data-col="${col}"]`);
  if (next) {
    next.focus();
    next.select();
  }
}

/** One mark: the number keyboard, red when it cannot be saved, greyed when absent. */
export function MarkInput({ cellKey, view, row, col, value, onChange, label, changed, invalid, absent, size }: Props) {
  return (
    <input
      data-mark={cellKey}
      data-mark-view={view}
      data-row={row}
      data-col={col}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          focusNext(view, row, col);
        }
      }}
      onFocus={(e) => e.currentTarget.select()}
      inputMode="decimal"
      enterKeyHint="next"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      aria-label={label}
      aria-invalid={invalid || undefined}
      className={cn(
        "rounded-md border border-input bg-background text-center font-numeric tabular-nums outline-none",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        size === "lg" ? "h-12 w-20 text-lg" : "h-9 w-16 text-sm",
        absent && "text-muted-foreground",
        changed && "border-primary bg-primary/10",
        invalid &&
          "border-destructive bg-destructive/10 ring-3 ring-destructive/20 focus-visible:border-destructive focus-visible:ring-destructive/30",
      )}
    />
  );
}
