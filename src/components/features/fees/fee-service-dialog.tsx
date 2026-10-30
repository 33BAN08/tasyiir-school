"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useTransition, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { FormTextField } from "@/components/features/forms/form-text-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { useRouter } from "@/i18n/navigation";
import { createFeeService, updateFeeService } from "@/lib/fees/settings-actions";
import { feeServiceSchema, type FeeServiceValues } from "@/lib/validations/fees";

import { useFeesError } from "./use-fees-error";

type Props = {
  yearId: string;
  /** Edit this service; create a new one when absent. */
  serviceId?: string;
  defaults: FeeServiceValues;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: ReactNode;
};

/** Create or edit a service: French + Arabic name, price per month, offered or not. */
export function FeeServiceDialog({ yearId, serviceId, defaults, open, onOpenChange, trigger }: Props) {
  const t = useTranslations("fees.services.form");
  const translateError = useFeesError();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<FeeServiceValues, unknown, z.output<typeof feeServiceSchema>>({
    resolver: zodResolver(feeServiceSchema),
    defaultValues: defaults,
  });

  const onSubmit = form.handleSubmit(() => {
    const values = form.getValues(); // raw values: the action validates again
    startTransition(async () => {
      const result = serviceId ? await updateFeeService(serviceId, values) : await createFeeService(yearId, values);
      if (!result.ok) {
        if (result.field) form.setError(result.field, { message: result.error }, { shouldFocus: true });
        else toast.error(translateError(result.error));
        return;
      }
      toast.success(t(serviceId ? "updated" : "created", { name: values.name.trim() }));
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
          <DialogTitle>{t(serviceId ? "editTitle" : "createTitle")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <FormTextField form={form} name="name" label={t("name")} autoComplete="off" className="min-h-11" translateError={translateError} />
            <FormTextField
              form={form}
              name="nameAr"
              label={t("nameAr")}
              optional
              dir="rtl"
              lang="ar"
              autoComplete="off"
              className="min-h-11"
              translateError={translateError}
            />
          </div>
          <FormTextField
            form={form}
            name="monthly"
            label={t("monthly")}
            inputMode="decimal"
            dir="ltr"
            autoComplete="off"
            className="min-h-11 font-numeric tabular-nums sm:max-w-48"
            translateError={translateError}
          />
          <Controller
            control={form.control}
            name="active"
            render={({ field }) => (
              <Field orientation="horizontal">
                <Checkbox id="fee-service-active" checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                <div className="flex flex-col gap-1">
                  <FieldLabel htmlFor="fee-service-active">{t("active")}</FieldLabel>
                  <FieldDescription>{t("activeHint")}</FieldDescription>
                </div>
              </Field>
            )}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="min-h-11" disabled={isPending}>
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" className="min-h-11" disabled={isPending}>
              {isPending ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
