"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useTransition, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

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
  DialogTrigger,
} from "@/components/ui/dialog";
import { useRouter } from "@/i18n/navigation";
import { createAcademicYear, updateAcademicYear } from "@/lib/structure/year-actions";
import { academicYearSchema, type AcademicYearFormValues } from "@/lib/validations/structure";

import { useSetupError } from "./use-setup-error";

type Props = {
  /** Edit this year; create a new one when absent. */
  yearId?: string;
  defaults: AcademicYearFormValues;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: ReactNode;
};

/** Create or edit an academic year: label, first and last day. */
export function YearDialog({ yearId, defaults, open, onOpenChange, trigger }: Props) {
  const t = useTranslations("setup.years.form");
  const translateError = useSetupError();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<AcademicYearFormValues>({ resolver: zodResolver(academicYearSchema), defaultValues: defaults });

  const onSubmit = form.handleSubmit(() => {
    const values = form.getValues(); // raw values: the action validates again
    startTransition(async () => {
      const result = yearId ? await updateAcademicYear(yearId, values) : await createAcademicYear(values);
      if (!result.ok) {
        if (result.field) form.setError(result.field, { message: result.error }, { shouldFocus: true });
        else toast.error(translateError(result.error));
        return;
      }
      toast.success(t(yearId ? "updated" : "created", { label: values.label.trim() }));
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
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(yearId ? "editTitle" : "createTitle")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          <FormTextField
            form={form}
            name="label"
            label={t("label")}
            description={t("labelHint")}
            autoComplete="off"
            translateError={translateError}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormTextField form={form} name="startDate" label={t("startDate")} type="date" translateError={translateError} />
            <FormTextField form={form} name="endDate" label={t("endDate")} type="date" translateError={translateError} />
          </div>
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
