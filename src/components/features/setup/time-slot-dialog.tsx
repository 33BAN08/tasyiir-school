"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useTransition, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";
import { createTimeSlot, updateTimeSlot } from "@/lib/structure/time-slot-actions";
import { DAY_KEYS, SLOT_KINDS, type SchoolDay } from "@/lib/structure/time-slot-template";
import { timeSlotSchema, type TimeSlotFormValues } from "@/lib/validations/structure";

import { useSetupError } from "./use-setup-error";

type Props = {
  yearId: string;
  day: SchoolDay;
  /** Edit this slot; create a new one when absent. */
  slotId?: string;
  defaults: TimeSlotFormValues;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: ReactNode;
};

/** Create or edit a time slot of one day: start, end, lesson or break, optional label. */
export function TimeSlotDialog({ yearId, day, slotId, defaults, open, onOpenChange, trigger }: Props) {
  const t = useTranslations("setup.timeSlots.form");
  const tDays = useTranslations("setup.timeSlots.days");
  const tKinds = useTranslations("setup.timeSlots.kinds");
  const translateError = useSetupError();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<TimeSlotFormValues>({ resolver: zodResolver(timeSlotSchema), defaultValues: defaults });

  const onSubmit = form.handleSubmit(() => {
    const values = form.getValues(); // raw values: the action validates again
    startTransition(async () => {
      const result = slotId ? await updateTimeSlot(slotId, values) : await createTimeSlot(yearId, day, values);
      if (!result.ok) {
        if (result.field) form.setError(result.field, { message: result.error }, { shouldFocus: true });
        else toast.error(translateError(result.error));
        return;
      }
      toast.success(t(slotId ? "updated" : "created"));
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
          <DialogTitle>{t(slotId ? "editTitle" : "createTitle", { day: tDays(DAY_KEYS[day]) })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-6">
            <FormTextField
              form={form}
              name="startTime"
              label={t("start")}
              placeholder="08:00"
              dir="ltr"
              autoComplete="off"
              className="font-numeric tabular-nums"
              translateError={translateError}
            />
            <FormTextField
              form={form}
              name="endTime"
              label={t("end")}
              placeholder="09:00"
              dir="ltr"
              autoComplete="off"
              className="font-numeric tabular-nums"
              translateError={translateError}
            />
          </div>
          <Controller
            control={form.control}
            name="kind"
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="field-kind">{t("kind")}</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="field-kind" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SLOT_KINDS.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {tKinds(kind)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          />
          <FormTextField
            form={form}
            name="label"
            label={t("label")}
            description={t("labelHint")}
            optional
            autoComplete="off"
            maxLength={40}
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
