"use client";

import { Lock, LockOpen, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/layout/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRouter } from "@/i18n/navigation";
import { formatDate, ltr } from "@/lib/format";
import { setPeriodLocked } from "@/lib/grading/period-actions";
import type { GradingPeriod } from "@/lib/grading/setup";

import { PeriodDialog } from "./period-dialog";
import { periodNameKey } from "./period-name";
import { useGradingError } from "./use-grading-error";

type Props = {
  periods: GradingPeriod[];
  year: { startDate: string; endDate: string };
  canManage: boolean;
};

/** The year's semesters: dates, weight in the annual average, locked or open. */
export function PeriodsList({ periods, year, canManage }: Props) {
  const t = useTranslations("grading.periods");
  const nameKey = periodNameKey(periods.length);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {periods.map((period) => (
        <PeriodCard
          key={period.id}
          period={period}
          name={t(`name.${nameKey}`, { number: period.number })}
          year={year}
          canManage={canManage}
        />
      ))}
    </div>
  );
}

function PeriodCard({
  period,
  name,
  year,
  canManage,
}: {
  period: GradingPeriod;
  name: string;
  year: Props["year"];
  canManage: boolean;
}) {
  const t = useTranslations("grading.periods");
  const [dialog, setDialog] = useState<"edit" | "lock" | null>(null);
  const range = ltr(`${formatDate(period.startDate)} – ${formatDate(period.endDate)}`);

  return (
    <Card data-period={period.number} data-locked={period.locked}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">{name}</CardTitle>
        {period.locked ? (
          <StatusBadge tone="warning" icon={Lock} label={t("locked")} />
        ) : (
          <StatusBadge tone="success" icon={LockOpen} label={t("open")} />
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{t("dates")}</dt>
          <dd className="font-numeric tabular-nums">{range}</dd>
          <dt className="text-muted-foreground">{t("weight")}</dt>
          <dd className="font-numeric tabular-nums">{period.weight.toLocaleString("fr-FR")}</dd>
        </dl>
        {period.locked && <p className="text-sm text-muted-foreground">{t("lockedHint")}</p>}
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {!period.locked && (
              <Button variant="outline" size="sm" onClick={() => setDialog("edit")}>
                <Pencil aria-hidden />
                {t("edit")}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setDialog("lock")}>
              {period.locked ? <LockOpen aria-hidden /> : <Lock aria-hidden />}
              {period.locked ? t("unlock") : t("lock")}
            </Button>
          </div>
        )}
      </CardContent>
      {canManage && !period.locked && (
        <PeriodDialog
          periodId={period.id}
          name={name}
          defaults={{ startDate: period.startDate, endDate: period.endDate, weight: String(period.weight) }}
          year={year}
          open={dialog === "edit"}
          onOpenChange={(open) => setDialog(open ? "edit" : null)}
        />
      )}
      {canManage && (
        <LockDialog
          period={period}
          name={name}
          open={dialog === "lock"}
          onOpenChange={(open) => setDialog(open ? "lock" : null)}
        />
      )}
    </Card>
  );
}

/** Lock / unlock, confirmed first: locking freezes the semester's grades (step 3). */
function LockDialog({
  period,
  name,
  open,
  onOpenChange,
}: {
  period: GradingPeriod;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("grading.periods.lockDialog");
  const translateError = useGradingError();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const mode = period.locked ? "unlock" : "lock";

  function confirm() {
    startTransition(async () => {
      const result = await setPeriodLocked(period.id, !period.locked);
      if (!result.ok) {
        toast.error(translateError(result.error));
        return;
      }
      toast.success(t(`${mode}Done`, { name }));
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t(`${mode}Title`, { name })}</DialogTitle>
          <DialogDescription>{t(`${mode}Description`)}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isPending}>
              {t("cancel")}
            </Button>
          </DialogClose>
          <Button disabled={isPending} onClick={confirm}>
            {t(`${mode}Confirm`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
