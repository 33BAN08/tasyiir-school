"use client";

import { useTranslations } from "next-intl";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { allocateOldestFirst, balanceOf, type LedgerCharge } from "@/lib/fees/ledger";
import { amountInputText, formatCentimes, parseAmount } from "@/lib/fees/money";
import { cn } from "@/lib/utils";

import { useChargeLabel } from "./use-charge-label";

/** Charge id → typed amount, for the charges the staff ticked. */
export type Picks = Record<string, string>;

/** The ticked charges as record_payment's list; null when a box is not a valid amount within its balance. */
export function picksToAllocations(open: LedgerCharge[], picks: Picks): { chargeId: string; amount: number }[] | null {
  const out: { chargeId: string; amount: number }[] = [];
  for (const c of open) {
    if (!(c.id in picks)) continue;
    const amount = parseAmount(picks[c.id]);
    if (amount === null || Number.isNaN(amount) || amount < 1 || amount > balanceOf(c)) return null;
    out.push({ chargeId: c.id, amount });
  }
  return out;
}

/** What the amount pays, oldest due first (the same order as the database). */
export function AllocationPreview({ open, amount, serviceNames }: { open: LedgerCharge[]; amount: number | null; serviceNames: Record<string, string> }) {
  const t = useTranslations("fees.student.pay");
  const label = useChargeLabel(serviceNames);
  if (amount === null || Number.isNaN(amount) || amount < 1) return null;
  const byId = new Map(open.map((c) => [c.id, c]));
  const lines = allocateOldestFirst(open, amount);
  return (
    <div className="flex flex-col gap-1 rounded-md border bg-muted/30 p-3" data-allocation-preview>
      <p className="text-xs font-medium text-muted-foreground">{t("previewTitle")}</p>
      <ul className="flex flex-col gap-1">
        {lines.map((a) => {
          const c = byId.get(a.chargeId);
          if (!c) return null;
          const full = a.amount === balanceOf(c);
          return (
            <li key={a.chargeId} className="flex items-baseline justify-between gap-2 text-sm" data-preview-charge={a.chargeId}>
              <bdi>{label(c)}</bdi>
              <span className={cn("font-numeric tabular-nums", !full && "text-warning")}>
                {full ? formatCentimes(a.amount) : t("previewPart", { amount: formatCentimes(a.amount), of: formatCentimes(balanceOf(c)) })}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type PickerProps = {
  open: LedgerCharge[];
  picks: Picks;
  onChange: (picks: Picks) => void;
  serviceNames: Record<string, string>;
  disabled: boolean;
  invalid: boolean;
};

/** The staff's own choice: tick charges, each pre-filled with its balance (changeable, never above it). */
export function AllocationPicker({ open, picks, onChange, serviceNames, disabled, invalid }: PickerProps) {
  const t = useTranslations("fees.student.pay");
  const label = useChargeLabel(serviceNames);
  return (
    <ul className={cn("flex max-h-72 flex-col divide-y overflow-y-auto rounded-md border", invalid && "border-destructive")} data-allocation-picker>
      {open.map((c) => {
        const ticked = c.id in picks;
        const amount = ticked ? parseAmount(picks[c.id]) : null;
        const bad = ticked && (amount === null || Number.isNaN(amount) || amount < 1 || amount > balanceOf(c));
        return (
          <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5">
            <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3">
              <Checkbox
                checked={ticked}
                disabled={disabled}
                onCheckedChange={(on) => {
                  const next = { ...picks };
                  if (on) next[c.id] = amountInputText(balanceOf(c));
                  else delete next[c.id];
                  onChange(next);
                }}
                aria-label={label(c)}
              />
              <span className="flex min-w-0 flex-col">
                <bdi className="text-sm">{label(c)}</bdi>
                <span className="font-numeric text-xs text-muted-foreground">{t("balanceOf", { amount: formatCentimes(balanceOf(c)) })}</span>
              </span>
            </label>
            {ticked && (
              <Input
                inputMode="decimal"
                dir="ltr"
                className="min-h-11 w-28 font-numeric tabular-nums"
                value={picks[c.id]}
                disabled={disabled}
                aria-invalid={bad}
                aria-label={t("pickAmount", { charge: label(c) })}
                onChange={(e) => onChange({ ...picks, [c.id]: e.target.value })}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
