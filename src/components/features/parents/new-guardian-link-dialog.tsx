"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
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
import { createGuardianForStudent } from "@/lib/parents/student-guardian-actions";
import { newGuardianLinkSchema, type NewGuardianLinkValues, type Relation } from "@/lib/validations/parents";

import { RelationSelect } from "./relation-select";
import { useParentsError } from "./use-parents-error";

const EMPTY: NewGuardianLinkValues = {
  lastName: "",
  firstName: "",
  phone: "",
  email: "",
  relation: "" as Relation,
};

type Props = { studentId: string; studentName: string; takenRelations: Relation[] };

/** From a student's page: create a parent and link them to this student in one step. */
export function NewGuardianLinkDialog({ studentId, studentName, takenRelations }: Props) {
  const t = useTranslations("students.guardians");
  const tForm = useTranslations("parents.form");
  const translateError = useParentsError();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const form = useForm<NewGuardianLinkValues>({ resolver: zodResolver(newGuardianLinkSchema), defaultValues: EMPTY });
  const relationError = form.formState.errors.relation?.message;

  const onSubmit = form.handleSubmit(() => {
    const values = form.getValues(); // raw values: the action validates again
    startTransition(async () => {
      const result = await createGuardianForStudent(studentId, values);
      if (!result.ok) {
        if (result.field) form.setError(result.field, { message: result.error }, { shouldFocus: true });
        else toast.error(translateError(result.error));
        return;
      }
      toast.success(t("created"));
      setOpen(false);
      form.reset(EMPTY);
      router.refresh();
    });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset(EMPTY);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus aria-hidden />
          {t("new")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("newTitle")}</DialogTitle>
          <DialogDescription>{t("newDescription", { name: studentName })}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <FormTextField
              form={form}
              name="lastName"
              label={tForm("lastName")}
              autoComplete="off"
              maxLength={60}
              translateError={translateError}
            />
            <FormTextField
              form={form}
              name="firstName"
              label={tForm("firstName")}
              autoComplete="off"
              maxLength={60}
              translateError={translateError}
            />
          </div>
          <Controller
            control={form.control}
            name="relation"
            render={({ field }) => (
              <Field data-invalid={Boolean(relationError)}>
                <FieldLabel htmlFor="new-guardian-relation">{t("relation")}</FieldLabel>
                <RelationSelect
                  id="new-guardian-relation"
                  value={field.value}
                  onChange={field.onChange}
                  invalid={Boolean(relationError)}
                  taken={takenRelations}
                />
                {relationError && <FieldError>{translateError(relationError)}</FieldError>}
              </Field>
            )}
          />
          <FormTextField
            form={form}
            name="phone"
            label={tForm("phone")}
            description={tForm("phoneHint")}
            type="tel"
            inputMode="tel"
            dir="ltr"
            placeholder="06 12 34 56 78"
            autoComplete="off"
            className="font-numeric tabular-nums"
            translateError={translateError}
          />
          <FormTextField
            form={form}
            name="email"
            label={tForm("email")}
            optional
            type="email"
            dir="ltr"
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
