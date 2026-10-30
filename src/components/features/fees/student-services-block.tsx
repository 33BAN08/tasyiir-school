"use client";

import { CalendarRange, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDeleteDialog } from "@/components/features/setup/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouter } from "@/i18n/navigation";
import { formatCentimes } from "@/lib/fees/money";
import { shortMonth } from "@/lib/fees/months";
import { removeStudentService } from "@/lib/fees/student-actions";

import { StudentServiceDialog } from "./student-service-dialog";
import { useFeesError } from "./use-fees-error";

export type ServicePeriodRow = {
  id: string;
  serviceId: string;
  name: string;
  monthly: number;
  fromMonth: string;
  toMonth: string | null;
};

type Props = {
  studentId: string;
  yearId: string;
  periods: ServicePeriodRow[];
  /** Active services of the year (what "Ajouter" offers). */
  services: { id: string; label: string }[];
  months: string[];
  canManage: boolean;
};

/** The student's services this year, each with its months; add / change months / remove (fees.manage). */
export function StudentServicesBlock({ studentId, yearId, periods, services, months, canManage }: Props) {
  const t = useTranslations("fees.student.services");
  const locale = useLocale();
  const [adding, setAdding] = useState(false);
  const periodText = (p: ServicePeriodRow) =>
    t("period", { from: shortMonth(p.fromMonth, locale), to: p.toMonth ? shortMonth(p.toMonth, locale) : t("untilEnd") });

  return (
    <section className="flex flex-col gap-2" aria-labelledby="student-fee-services">
      <div className="flex min-h-11 items-center justify-between gap-2">
        <h3 id="student-fee-services" className="text-sm font-semibold">
          {t("title")}
        </h3>
        {canManage && services.length > 0 && months.length > 0 && (
          <StudentServiceDialog
            studentId={studentId}
            yearId={yearId}
            services={services}
            months={months}
            defaults={{ serviceId: services[0].id, fromMonth: months[0], toMonth: null }}
            open={adding}
            onOpenChange={setAdding}
            trigger={
              <Button variant="outline" size="sm" className="min-h-11">
                <Plus aria-hidden />
                {t("add")}
              </Button>
            }
          />
        )}
      </div>
      {periods.length === 0 ? (
        <p className="text-sm text-muted-foreground">{canManage && services.length === 0 ? t("noService") : t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {periods.map((p) => (
            <li key={p.id} data-student-service={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
              <bdi className="min-w-0 flex-1 font-medium">{p.name}</bdi>
              <span className="font-numeric text-sm tabular-nums">{t("perMonth", { amount: formatCentimes(p.monthly) })}</span>
              <span className="font-numeric text-sm text-muted-foreground">{periodText(p)}</span>
              {canManage && (
                <PeriodMenu studentId={studentId} yearId={yearId} period={p} months={months} periodText={periodText(p)} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PeriodMenu({
  studentId,
  yearId,
  period,
  months,
  periodText,
}: {
  studentId: string;
  yearId: string;
  period: ServicePeriodRow;
  months: string[];
  periodText: string;
}) {
  const t = useTranslations("fees.student.services");
  const translateError = useFeesError();
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "remove" | null>(null);
  const [isPending, startTransition] = useTransition();
  const close = (open: boolean) => !open && setDialog(null);

  function remove() {
    startTransition(async () => {
      const result = await removeStudentService(period.id);
      setDialog(null);
      if (!result.ok) {
        toast.error(translateError(result.error));
        return;
      }
      toast.success(t("removed"));
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-11" aria-label={t("menu", { name: period.name })} disabled={isPending}>
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-44">
          <DropdownMenuItem onSelect={() => setDialog("edit")}>
            <CalendarRange aria-hidden />
            {t("edit")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog("remove")}>
            <Trash2 aria-hidden />
            {t("remove")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <StudentServiceDialog
        studentId={studentId}
        yearId={yearId}
        periodId={period.id}
        services={[{ id: period.serviceId, label: period.name }]}
        months={months}
        defaults={{ serviceId: period.serviceId, fromMonth: period.fromMonth, toMonth: period.toMonth }}
        open={dialog === "edit"}
        onOpenChange={close}
      />
      <ConfirmDeleteDialog
        open={dialog === "remove"}
        onOpenChange={close}
        title={t("removeTitle", { name: period.name })}
        description={t("removeDescription", { period: periodText })}
        pending={isPending}
        onConfirm={remove}
      />
    </>
  );
}
