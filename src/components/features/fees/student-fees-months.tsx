"use client";

import { Ban, CircleCheck, CircleDashed, CircleMinus, CircleX, Clock3, type LucideIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { balanceOf, type LedgerCharge, type LedgerTotals, type MonthCell, type MonthState } from "@/lib/fees/ledger";
import { formatCentimes } from "@/lib/fees/money";
import { shortMonth } from "@/lib/fees/months";
import { cn } from "@/lib/utils";

import { CancelChargeDialog } from "./cancel-charge-dialog";
import { useChargeLabel } from "./use-charge-label";

const STATE_STYLE: Record<MonthState, { icon: LucideIcon; className: string }> = {
  paid: { icon: CircleCheck, className: "border-success/40 text-success" },
  partial: { icon: CircleMinus, className: "border-warning/50 text-warning" },
  unpaid: { icon: CircleX, className: "border-danger/40 text-danger" },
  notDue: { icon: Clock3, className: "text-muted-foreground" },
  free: { icon: CircleDashed, className: "text-muted-foreground" },
  cancelled: { icon: Ban, className: "text-muted-foreground line-through" },
};

type Props = {
  cells: MonthCell[];
  totals: LedgerTotals;
  serviceNames: Record<string, string>;
  /** Receipt labels per charge (payments not cancelled). */
  receipts: Record<string, string[]>;
  /** fees.cancel: cancel a charge that has no money on it. */
  canCancel: boolean;
};

/** The registration fee and each billed month with its state; a cell opens its charges. */
export function StudentFeesMonths({ cells, totals, serviceNames, receipts, canCancel }: Props) {
  const t = useTranslations("fees.student.ledger");
  const locale = useLocale();

  if (cells.length === 0) return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  const facts: [string, number, string?][] = [
    [t("total"), totals.total],
    [t("paid"), totals.paid, "text-success"],
    [t("balance"), totals.balance],
    [t("dueNow"), totals.dueNow, totals.dueNow > 0 ? "text-danger" : undefined],
  ];

  return (
    <section className="flex flex-col gap-3" aria-labelledby="student-fee-months">
      <h3 id="student-fee-months" className="text-sm font-semibold">
        {t("title")}
      </h3>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-fee-totals>
        {facts.map(([label, value, tone]) => (
          <div key={label} className="flex flex-col gap-0.5 rounded-md border px-3 py-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className={cn("font-numeric text-sm font-semibold tabular-nums", tone)}>{formatCentimes(value)}</dd>
          </div>
        ))}
      </dl>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {cells.map((cell) => (
          <li key={cell.key}>
            <MonthButton
              cell={cell}
              title={cell.month ? shortMonth(cell.month, locale) : t("registration")}
              serviceNames={serviceNames}
              receipts={receipts}
              canCancel={canCancel}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function MonthButton({
  cell,
  title,
  serviceNames,
  receipts,
  canCancel,
}: {
  cell: MonthCell;
  title: string;
  serviceNames: Record<string, string>;
  receipts: Record<string, string[]>;
  canCancel: boolean;
}) {
  const t = useTranslations("fees.student.ledger");
  const label = useChargeLabel(serviceNames);
  const [open, setOpen] = useState(false);
  const [cancelling, setCancelling] = useState<LedgerCharge | null>(null);
  const style = STATE_STYLE[cell.state];
  const Icon = style.icon;
  const left = cell.net - cell.paid;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn("h-auto min-h-11 w-full flex-col items-start gap-0.5 px-3 py-2 text-start", style.className)}
            data-month-state={cell.state}
            data-month={cell.key}
            aria-label={t("cellLabel", { month: title, state: t(`states.${cell.state}`) })}
          >
            <span className="font-numeric text-sm font-medium text-foreground">{title}</span>
            <span className="font-numeric text-xs tabular-nums text-foreground">{formatCentimes(cell.net)}</span>
            <span className="flex items-center gap-1 text-xs font-medium">
              <Icon className="size-3.5" aria-hidden />
              {cell.state === "partial" ? t("left", { amount: formatCentimes(left) }) : t(`states.${cell.state}`)}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))]" data-month-details={cell.key}>
          <p className="mb-2 font-numeric text-sm font-semibold">{title}</p>
          <ul className="flex flex-col divide-y">
            {cell.charges.map((c) => (
              <li key={c.id} className="flex flex-col gap-1 py-2" data-charge={c.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <bdi className={cn("text-sm", c.cancelled && "line-through text-muted-foreground")}>{label(c, false)}</bdi>
                  <span className="font-numeric text-sm tabular-nums">{formatCentimes(c.net)}</span>
                </div>
                {c.cancelled ? (
                  <p className="text-xs text-muted-foreground">
                    {t("chargeCancelled", { reason: t(`chargeReasons.${c.cancelled.reason}`) })}
                    {c.cancelled.note && <bdi> · {c.cancelled.note}</bdi>}
                  </p>
                ) : (
                  <p className="font-numeric text-xs text-muted-foreground">
                    {c.gross > c.net && `${t("discounted", { amount: formatCentimes(c.gross - c.net) })} · `}
                    {t("paidOf", { amount: formatCentimes(Math.min(c.paid, c.net)) })}
                    {balanceOf(c) > 0 && ` · ${t("left", { amount: formatCentimes(balanceOf(c)) })}`}
                  </p>
                )}
                {(receipts[c.id] ?? []).length > 0 && (
                  <p className="font-numeric text-xs text-muted-foreground">
                    {t("receipts", { labels: (receipts[c.id] ?? []).map((r) => `⁦${r}⁩`).join(", ") })}
                  </p>
                )}
                {canCancel && !c.cancelled && c.paid === 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-11 self-start text-danger"
                    onClick={() => {
                      setOpen(false);
                      setCancelling(c);
                    }}
                  >
                    {t("cancelCharge")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
      {cancelling && (
        <CancelChargeDialog
          chargeId={cancelling.id}
          chargeLabel={label(cancelling)}
          amount={cancelling.net}
          open
          onOpenChange={(next) => !next && setCancelling(null)}
        />
      )}
    </>
  );
}
