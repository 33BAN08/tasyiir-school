"use client";

import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { balanceOf, monthCells, type MonthCell } from "@/lib/fees/ledger";
import { formatCentimes } from "@/lib/fees/money";
import { shortMonth } from "@/lib/fees/months";
import type { ParentCharge } from "@/lib/fees/parent";
import { cn } from "@/lib/utils";

import { MONTH_STATE_STYLE } from "./month-state-style";

/** The parent's months: read-only. A cell shows the net amount, its "Remise" line and state; tapping opens its charges. */
export function ParentFeeMonths({ charges, today }: { charges: ParentCharge[]; today: string }) {
  const t = useTranslations("fees.student.ledger");
  const locale = useLocale();
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {monthCells(charges, today).map((cell) => (
        <li key={cell.key}>
          <MonthButton cell={cell} title={cell.month ? shortMonth(cell.month, locale) : t("registration")} />
        </li>
      ))}
    </ul>
  );
}

function MonthButton({ cell, title }: { cell: MonthCell<ParentCharge>; title: string }) {
  const t = useTranslations("fees.student.ledger");
  const tp = useTranslations("portal.fees");
  const locale = useLocale();
  const style = MONTH_STATE_STYLE[cell.state];
  const Icon = style.icon;
  const discount = cell.charges.reduce((sum, c) => sum + c.discount, 0);
  const cancelled = cell.state === "cancelled";
  const label = (c: ParentCharge) => {
    if (c.kind === "registration") return t("registration");
    if (c.kind === "tuition") return t("tuition");
    return (locale === "ar" ? c.serviceNameAr || c.serviceName : c.serviceName) || t("service");
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("h-auto min-h-11 w-full flex-col items-start gap-0.5 px-3 py-2 text-start", style.className)}
          data-month={cell.key}
          data-month-state={cell.state}
          data-month-net={cancelled ? undefined : cell.net}
          data-month-discount={discount > 0 ? discount : undefined}
          aria-label={t("cellLabel", { month: title, state: t(`states.${cell.state}`) })}
        >
          <span className="font-numeric text-sm font-medium text-foreground">{title}</span>
          {!cancelled && <span className="font-numeric text-xs tabular-nums text-foreground">{formatCentimes(cell.net)}</span>}
          {discount > 0 && (
            <span className="font-numeric text-xs tabular-nums text-muted-foreground">{tp("discount", { amount: formatCentimes(discount) })}</span>
          )}
          <span className="flex items-center gap-1 text-xs font-medium">
            <Icon className="size-3.5" aria-hidden />
            {cell.state === "partial" ? t("left", { amount: formatCentimes(cell.net - cell.paid) }) : t(`states.${cell.state}`)}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))]" data-month-details={cell.key}>
        <p className="mb-2 font-numeric text-sm font-semibold">{title}</p>
        <ul className="flex flex-col divide-y">
          {cell.charges.map((c) => (
            <li key={c.id} className="flex flex-col gap-1 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <bdi className={cn("text-sm", c.cancelled && "text-muted-foreground line-through")}>{label(c)}</bdi>
                {!c.cancelled && <span className="font-numeric text-sm tabular-nums">{formatCentimes(c.net)}</span>}
              </div>
              {c.cancelled ? (
                <p className="text-xs text-muted-foreground">{t("states.cancelled")}</p>
              ) : (
                <p className="font-numeric text-xs text-muted-foreground">
                  {c.discount > 0 && `${tp("discount", { amount: formatCentimes(c.discount) })} · `}
                  {t("paidOf", { amount: formatCentimes(Math.min(c.paid, c.net)) })}
                  {balanceOf(c) > 0 && ` · ${t("left", { amount: formatCentimes(balanceOf(c)) })}`}
                </p>
              )}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
