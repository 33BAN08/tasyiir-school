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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";
import { createLevel, updateLevel } from "@/lib/structure/level-actions";
import { CYCLES } from "@/lib/structure/level-template";
import { levelSchema, type LevelFormValues } from "@/lib/validations/structure";

import { useSetupError } from "./use-setup-error";

type Props = {
  /** Edit this level; create a new one when absent. */
  levelId?: string;
  defaults: LevelFormValues;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: ReactNode;
};

/** Create or edit a level: short name (used in class names) and cycle. */
export function LevelDialog({ levelId, defaults, open, onOpenChange, trigger }: Props) {
  const t = useTranslations("setup.levels.form");
  const tCycles = useTranslations("setup.levels.cycles");
  const translateError = useSetupError();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<LevelFormValues>({ resolver: zodResolver(levelSchema), defaultValues: defaults });
  const cycleError = form.formState.errors.cycle?.message;

  const onSubmit = form.handleSubmit(() => {
    const values = form.getValues(); // raw values: the action validates again
    startTransition(async () => {
      const result = levelId ? await updateLevel(levelId, values) : await createLevel(values);
      if (!result.ok) {
        if (result.field) form.setError(result.field, { message: result.error }, { shouldFocus: true });
        else toast.error(translateError(result.error));
        return;
      }
      toast.success(t(levelId ? "updated" : "created", { name: values.name.trim() }));
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
          <DialogTitle>{t(levelId ? "editTitle" : "createTitle")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          <FormTextField
            form={form}
            name="name"
            label={t("name")}
            description={t("nameHint")}
            autoComplete="off"
            translateError={translateError}
          />
          <Controller
            control={form.control}
            name="cycle"
            render={({ field }) => (
              <Field data-invalid={!!cycleError}>
                <FieldLabel htmlFor="field-cycle">{t("cycle")}</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="field-cycle" className="w-full" aria-invalid={!!cycleError}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CYCLES.map((cycle) => (
                      <SelectItem key={cycle} value={cycle}>
                        {tCycles(cycle)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {cycleError && <FieldError>{translateError(cycleError)}</FieldError>}
              </Field>
            )}
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
