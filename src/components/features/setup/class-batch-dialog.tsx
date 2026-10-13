"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { FormTextField } from "@/components/features/forms/form-text-field";
import { Badge } from "@/components/ui/badge";
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
import { createClasses } from "@/lib/structure/class-actions";
import { MAX_BATCH_CLASSES, suggestClassNames } from "@/lib/structure/class-names";
import type { Level } from "@/lib/structure/levels";
import { classBatchSchema, type ClassBatchFormValues } from "@/lib/validations/structure";

import { LevelTrackFields } from "./level-track-fields";
import { useSetupError } from "./use-setup-error";

type Props = { academicYearId: string; levels: Level[]; takenNames: string[]; trigger: ReactNode };

const COUNTS = Array.from({ length: MAX_BATCH_CLASSES }, (_, i) => String(i + 1));

/** Several classes of one level at once: "1AC-A" … "1AC-D", skipping names already used. */
export function ClassBatchDialog({ academicYearId, levels, takenNames, trigger }: Props) {
  const t = useTranslations("setup.classes.batch");
  const translateError = useSetupError();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const defaults: ClassBatchFormValues = { levelId: "", trackId: "", prefix: "", count: "4" };
  const form = useForm<ClassBatchFormValues>({ resolver: zodResolver(classBatchSchema), defaultValues: defaults });
  const [levelId, trackId, prefix, count] = useWatch({
    control: form.control,
    name: ["levelId", "trackId", "prefix", "count"],
  });
  const { errors } = form.formState;
  const preview = prefix.trim() ? suggestClassNames(prefix, takenNames, Number(count)) : [];
  const revalidate = { shouldValidate: form.formState.isSubmitted };

  const onSubmit = form.handleSubmit(() => {
    const values = form.getValues();
    startTransition(async () => {
      const result = await createClasses(academicYearId, values);
      if (!result.ok) {
        if (result.field) form.setError(result.field, { message: result.error }, { shouldFocus: true });
        else toast.error(translateError(result.error));
        return;
      }
      toast.success(t("created", { count: result.data.names.length, names: result.data.names.join(", ") }));
      setOpen(false);
      form.reset(defaults);
      router.refresh();
    });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset(defaults);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          <LevelTrackFields
            levels={levels}
            levelId={levelId}
            trackId={trackId}
            onLevelChange={(level) => {
              form.setValue("levelId", level.id, revalidate);
              form.setValue("trackId", "");
              form.setValue("prefix", level.name, revalidate);
            }}
            onTrackChange={(id) => form.setValue("trackId", id, revalidate)}
            levelError={errors.levelId?.message && translateError(errors.levelId.message)}
            trackError={errors.trackId?.message && translateError(errors.trackId.message)}
          />
          <div className="grid gap-6 sm:grid-cols-[1fr_8rem]">
            <FormTextField
              form={form}
              name="prefix"
              label={t("prefix")}
              description={t("prefixHint")}
              autoComplete="off"
              translateError={translateError}
            />
            <Controller
              control={form.control}
              name="count"
              render={({ field }) => (
                <Field data-invalid={!!errors.count}>
                  <FieldLabel htmlFor="field-count">{t("count")}</FieldLabel>
                  <Select value={String(field.value)} onValueChange={field.onChange}>
                    <SelectTrigger id="field-count" className="w-full" aria-invalid={!!errors.count}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTS.map((n) => (
                        <SelectItem key={n} value={n}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.count?.message && <FieldError>{translateError(errors.count.message)}</FieldError>}
                </Field>
              )}
            />
          </div>
          {prefix.trim() !== "" && (
            <div className="flex flex-col gap-2" aria-live="polite">
              <p className="text-sm font-medium">{t("preview")}</p>
              {preview ? (
                <div className="flex flex-wrap gap-1.5">
                  {preview.map((name) => (
                    <Badge key={name} variant="secondary" className="font-normal" dir="ltr">
                      {name}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-destructive">{translateError("tooManyClasses")}</p>
              )}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending || !preview}>
              {isPending ? t("saving") : t("submit", { count: Number(count) })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
