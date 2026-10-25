"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormDateField } from "@/components/features/forms/form-date-field";
import { FormTextField } from "@/components/features/forms/form-text-field";
import { Button } from "@/components/ui/button";
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
import { updatePeriod } from "@/lib/grading/period-actions";
import { formatDate } from "@/lib/format";
import { periodSchema, type PeriodFormValues } from "@/lib/validations/grading";

import { useGradingError } from "./use-grading-error";

type Props = {
  periodId: string;
  name: string;
  defaults: PeriodFormValues;
  year: { startDate: string; endDate: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Dates and weight of one semester (an unlocked one). */
export function PeriodDialog({ periodId, name, defaults, year, open, onOpenChange }: Props) {
  const t = useTranslations("grading.periods.form");
  const translateError = useGradingError();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm({ resolver: zodResolver(periodSchema), defaultValues: defaults });

  const onSubmit = form.handleSubmit(() => {
    const values = form.getValues(); // raw values: the action validates again
    startTransition(async () => {
      const result = await updatePeriod(periodId, values);
      if (!result.ok) {
        if (result.field) form.setError(result.field, { message: result.error }, { shouldFocus: true });
        else toast.error(translateError(result.error));
        return;
      }
      toast.success(t("saved", { name }));
      onOpenChange(false);
      router.refresh();
    });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) form.reset(defaults);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { name })}</DialogTitle>
          <DialogDescription>
            {t("description", { start: formatDate(year.startDate), end: formatDate(year.endDate) })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <FormDateField form={form} name="startDate" label={t("startDate")} translateError={translateError} />
            <FormDateField form={form} name="endDate" label={t("endDate")} translateError={translateError} />
          </div>
          <FormTextField
            form={form}
            name="weight"
            label={t("weight")}
            description={t("weightHint")}
            inputMode="decimal"
            autoComplete="off"
            translateError={translateError}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
