"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRef, useTransition, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
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
import { createClass, updateClass } from "@/lib/structure/class-actions";
import { suggestClassNames } from "@/lib/structure/class-names";
import type { Level } from "@/lib/structure/levels";
import { classSchema, type ClassFormValues } from "@/lib/validations/structure";

import { LevelTrackFields } from "./level-track-fields";
import { useSetupError } from "./use-setup-error";

type Props = {
  academicYearId: string;
  /** Edit this class; create a new one when absent. */
  classId?: string;
  defaults: ClassFormValues;
  levels: Level[];
  /** The year's class names, for the "1AC-A" suggestion. */
  takenNames: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: ReactNode;
};

/** Create or edit one class: level, optional filière, name (suggested "1AC-A"). */
export function ClassDialog({ academicYearId, classId, defaults, levels, takenNames, open, onOpenChange, trigger }: Props) {
  const t = useTranslations("setup.classes.form");
  const translateError = useSetupError();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<ClassFormValues>({ resolver: zodResolver(classSchema), defaultValues: defaults });
  const [levelId, trackId] = useWatch({ control: form.control, name: ["levelId", "trackId"] });
  const { errors } = form.formState;
  // The name follows the level until the director types their own.
  const suggested = useRef(classId ? null : defaults.name);

  function pickLevel(level: Level) {
    form.setValue("levelId", level.id, { shouldValidate: form.formState.isSubmitted });
    form.setValue("trackId", "");
    const name = form.getValues("name");
    if (name === "" || name === suggested.current) {
      const next = suggestClassNames(level.name, takenNames, 1)?.[0] ?? "";
      suggested.current = next;
      form.setValue("name", next, { shouldValidate: form.formState.isSubmitted });
    }
  }

  const onSubmit = form.handleSubmit(() => {
    const values = form.getValues(); // raw values: the action validates again
    startTransition(async () => {
      const result = classId ? await updateClass(classId, values) : await createClass(academicYearId, values);
      if (!result.ok) {
        if (result.field) form.setError(result.field, { message: result.error }, { shouldFocus: true });
        else toast.error(translateError(result.error));
        return;
      }
      toast.success(t(classId ? "updated" : "created", { name: values.name.trim() }));
      onOpenChange(false);
      router.refresh();
    });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          form.reset(defaults);
          suggested.current = classId ? null : defaults.name;
        }
      }}
    >
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(classId ? "editTitle" : "createTitle")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          <LevelTrackFields
            levels={levels}
            levelId={levelId}
            trackId={trackId}
            onLevelChange={pickLevel}
            onTrackChange={(id) => form.setValue("trackId", id, { shouldValidate: form.formState.isSubmitted })}
            levelError={errors.levelId?.message && translateError(errors.levelId.message)}
            trackError={errors.trackId?.message && translateError(errors.trackId.message)}
          />
          <FormTextField
            form={form}
            name="name"
            label={t("name")}
            description={t("nameHint")}
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
