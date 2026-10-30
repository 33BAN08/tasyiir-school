"use client";

import { Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { shortMonth } from "@/lib/fees/months";
import { resetFeeMonths, saveFeeMonths } from "@/lib/fees/settings-actions";
import type { FeeMonths } from "@/lib/fees/setup";
import { cn } from "@/lib/utils";

import { useFeesError } from "./use-fees-error";

type Props = {
  yearId: string;
  /** Every month overlapping the year, in order. */
  yearMonths: string[];
  value: FeeMonths;
  canManage: boolean;
};

/** The billed months (one toggle per month of the year) and the due day. */
export function FeeMonthsForm({ yearId, yearMonths, value, canManage }: Props) {
  const t = useTranslations("fees.months");
  const locale = useLocale();
  const translateError = useFeesError();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState(() => new Set(value.months));
  const [dueDay, setDueDay] = useState(String(value.dueDay));
  const [error, setError] = useState<{ field?: string; key: string } | null>(null);
  const months = yearMonths.filter((m) => selected.has(m));
  const dirty = months.join() !== value.months.join() || dueDay.trim() !== String(value.dueDay);

  const toggle = (month: string) => {
    setError(null);
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(month)) next.delete(month);
      else next.add(month);
      return next;
    });
  };

  function save() {
    startTransition(async () => {
      const result = await saveFeeMonths(yearId, { months, dueDay: dueDay.trim() });
      if (!result.ok) {
        setError({ field: result.field, key: result.error });
        if (!result.field) toast.error(translateError(result.error));
        return;
      }
      toast.success(t("saved"));
      router.refresh();
    });
  }

  function reset() {
    startTransition(async () => {
      const result = await resetFeeMonths(yearId);
      if (!result.ok) {
        toast.error(translateError(result.error));
        return;
      }
      toast.success(t("resetDone"));
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="fee-months-label" className="text-sm font-medium">
              {t("billed")}
            </h3>
            <Badge variant={value.customised ? "secondary" : "outline"} data-fee-months-default={!value.customised}>
              {value.customised ? t("customBadge") : t("defaultBadge")}
            </Badge>
            <span className="text-sm text-muted-foreground">{t("count", { count: months.length })}</span>
          </div>
          <div role="group" aria-labelledby="fee-months-label" className="flex flex-wrap gap-2">
            {yearMonths.map((month) => {
              const on = selected.has(month);
              return (
                <button
                  key={month}
                  type="button"
                  aria-pressed={on}
                  data-month={month}
                  disabled={!canManage || isPending}
                  onClick={() => toggle(month)}
                  className={cn(
                    "flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors disabled:cursor-default",
                    on ? "border-primary bg-primary/10 font-medium text-foreground" : "text-muted-foreground",
                    canManage && "hover:border-primary",
                  )}
                >
                  {on && <Check className="size-4 text-primary" aria-hidden />}
                  <span className="font-numeric">{shortMonth(month, locale)}</span>
                </button>
              );
            })}
          </div>
          {error?.field === "months" && <p className="text-sm text-destructive">{translateError(error.key)}</p>}
        </div>

        {canManage ? (
          <Field data-invalid={error?.field === "dueDay"} className="max-w-56">
            <FieldLabel htmlFor="fee-due-day">{t("dueDay")}</FieldLabel>
            <Input
              id="fee-due-day"
              inputMode="numeric"
              autoComplete="off"
              className="min-h-11 font-numeric tabular-nums"
              value={dueDay}
              aria-invalid={error?.field === "dueDay"}
              disabled={isPending}
              onChange={(e) => {
                setError(null);
                setDueDay(e.target.value);
              }}
            />
            <FieldDescription>{t("dueDayHint")}</FieldDescription>
            {error?.field === "dueDay" && <FieldError>{translateError(error.key)}</FieldError>}
          </Field>
        ) : (
          <p className="text-sm">{t("dueDayText", { day: value.dueDay })}</p>
        )}

        {canManage && (
          <div className="flex flex-wrap justify-end gap-2">
            {value.customised && (
              <Button variant="outline" className="min-h-11" onClick={reset} disabled={isPending}>
                {t("reset")}
              </Button>
            )}
            <Button className="min-h-11" onClick={save} disabled={isPending || !dirty}>
              {isPending ? t("saving") : t("save")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
