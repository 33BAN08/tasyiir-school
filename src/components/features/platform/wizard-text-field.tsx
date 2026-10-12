"use client";

import { useTranslations } from "next-intl";
import type { ComponentProps } from "react";
import type { UseFormReturn } from "react-hook-form";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { NewSchoolFormValues, NewSchoolInput } from "@/lib/validations/platform";

/** The wizard's form: raw string values in, zod-transformed values out. */
export type NewSchoolForm = UseFormReturn<NewSchoolFormValues, unknown, NewSchoolInput>;

type TextFieldName = {
  [K in keyof NewSchoolFormValues]: NewSchoolFormValues[K] extends string ? K : never;
}[keyof NewSchoolFormValues];

type Props = Omit<ComponentProps<typeof Input>, "name" | "form"> & {
  form: NewSchoolForm;
  name: TextFieldName;
  label: string;
  description?: string;
  optional?: boolean;
  /** Called after the form has stored the new value (e.g. to derive another field). */
  onValueChange?: (value: string) => void;
};

/** Label above, input, hint, translated inline error (docs/DESIGN.md form rules). */
export function WizardTextField({
  form,
  name,
  label,
  description,
  optional,
  onValueChange,
  ...inputProps
}: Props) {
  const t = useTranslations("platform.wizard");
  const error = form.formState.errors[name]?.message;
  const id = `wizard-${name}`;
  const registered = form.register(name);

  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>
        {label}
        {optional && <span className="font-normal text-muted-foreground">({t("optional")})</span>}
      </FieldLabel>
      <Input
        id={id}
        aria-invalid={!!error}
        {...inputProps}
        {...registered}
        onChange={async (e) => {
          await registered.onChange(e);
          // Steps validate with trigger() (no submit), so RHF would not re-check on
          // change: do it while an error is shown, so it clears as soon as it is fixed.
          if (form.getFieldState(name).error) void form.trigger(name);
          onValueChange?.(e.target.value);
        }}
      />
      {description && <FieldDescription>{description}</FieldDescription>}
      {error && <FieldError>{t(`errors.${error}`)}</FieldError>}
    </Field>
  );
}
