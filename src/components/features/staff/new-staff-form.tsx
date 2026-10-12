"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormTextField } from "@/components/features/forms/form-text-field";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { labelledRoles } from "@/lib/auth/roles";
import { createStaff } from "@/lib/staff/actions";
import type { StaffRole } from "@/lib/staff/staff";
import { newStaffSchema, type NewStaffFormValues, type NewStaffInput } from "@/lib/validations/staff";

import { LocaleField } from "./locale-field";
import { useStaffError } from "./use-staff-error";

export type CreatedStaff = { name: string; email: string; password: string };

type Props = { roles: StaffRole[]; onCreated: (created: CreatedStaff) => void; onCancel: () => void };

export function NewStaffForm({ roles, onCreated, onCancel }: Props) {
  const t = useTranslations("staff.create");
  const tRoles = useTranslations("roles");
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();

  const form = useForm<NewStaffFormValues, unknown, NewStaffInput>({
    resolver: zodResolver(newStaffSchema),
    defaultValues: {
      fullName: "",
      email: "",
      roleId: "",
      phone: "",
      locale: locale as NewStaffFormValues["locale"],
    },
  });
  const translateError = useStaffError();

  function onSubmit(values: NewStaffInput) {
    startTransition(async () => {
      // Raw form values: the action validates (and transforms) them itself.
      const result = await createStaff(form.getValues());
      if (result.ok) {
        toast.success(t("toast", { name: values.fullName }));
        onCreated({ name: values.fullName, email: result.data.email, password: result.data.temporaryPassword });
        return;
      }
      if (result.field) form.setError(result.field, { message: result.error }, { shouldFocus: true });
      else toast.error(translateError(result.error));
    });
  }

  const roleError = form.formState.errors.roleId?.message;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
      <FieldGroup>
        <FormTextField
          form={form}
          name="fullName"
          label={t("fullName")}
          autoComplete="off"
          // Also after "add another": the button that had focus is gone.
          autoFocus
          translateError={translateError}
        />
        <FormTextField
          form={form}
          name="email"
          label={t("email")}
          type="email"
          dir="ltr"
          autoComplete="off"
          translateError={translateError}
        />
        <Controller
          control={form.control}
          name="roleId"
          render={({ field }) => (
            <Field data-invalid={!!roleError}>
              <FieldLabel htmlFor="staff-roleId">{t("role")}</FieldLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="staff-roleId" className="w-full" aria-invalid={!!roleError}>
                  <SelectValue placeholder={t("rolePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {labelledRoles(roles, tRoles, locale).map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {roleError && <FieldError>{translateError(roleError)}</FieldError>}
            </Field>
          )}
        />
        <FormTextField
          form={form}
          name="phone"
          label={t("phone")}
          optional
          type="tel"
          dir="ltr"
          autoComplete="off"
          translateError={translateError}
        />
        <LocaleField control={form.control} name="locale" id="staff-locale" label={t("locale")} />
      </FieldGroup>
      <p className="text-sm text-muted-foreground">{t("passwordNote")}</p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? t("submitting") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
