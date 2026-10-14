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
import { useRouter } from "@/i18n/navigation";
import { createSubject, updateSubject } from "@/lib/structure/subject-actions";
import { subjectSchema, type SubjectFormValues } from "@/lib/validations/structure";

import { SubjectColorPicker } from "./subject-color-picker";
import { useSetupError } from "./use-setup-error";

type Props = {
  /** Edit this subject; create a new one when absent. */
  subjectId?: string;
  defaults: SubjectFormValues;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: ReactNode;
};

/** Create or edit a subject: name, optional short code, timetable colour. */
export function SubjectDialog({ subjectId, defaults, open, onOpenChange, trigger }: Props) {
  const t = useTranslations("setup.subjects.form");
  const translateError = useSetupError();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<SubjectFormValues>({ resolver: zodResolver(subjectSchema), defaultValues: defaults });
  const colorError = form.formState.errors.color?.message;

  const onSubmit = form.handleSubmit(() => {
    const values = form.getValues(); // raw values: the action validates again
    startTransition(async () => {
      const result = subjectId ? await updateSubject(subjectId, values) : await createSubject(values);
      if (!result.ok) {
        if (result.field) form.setError(result.field, { message: result.error }, { shouldFocus: true });
        else toast.error(translateError(result.error));
        return;
      }
      toast.success(t(subjectId ? "updated" : "created", { name: values.name.trim() }));
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
          <DialogTitle>{t(subjectId ? "editTitle" : "createTitle")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          <div className="grid gap-6 sm:grid-cols-[1fr_8rem]">
            <FormTextField
              form={form}
              name="name"
              label={t("name")}
              autoComplete="off"
              translateError={translateError}
            />
            <FormTextField
              form={form}
              name="code"
              label={t("code")}
              optional
              autoComplete="off"
              maxLength={6}
              translateError={translateError}
            />
          </div>
          <Controller
            control={form.control}
            name="color"
            render={({ field }) => (
              <Field data-invalid={!!colorError}>
                <FieldLabel id="subject-color-label">{t("color")}</FieldLabel>
                <SubjectColorPicker value={field.value} onChange={field.onChange} labelledBy="subject-color-label" />
                {colorError && <FieldError>{translateError(colorError)}</FieldError>}
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
