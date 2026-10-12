"use client";

import { useTranslations } from "next-intl";
import type { ComponentProps } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type Props<TValues extends FieldValues, TOutput> = Omit<ComponentProps<typeof Input>, "name" | "form"> & {
  form: UseFormReturn<TValues, unknown, TOutput>;
  name: Path<TValues>;
  label: string;
  description?: string;
  optional?: boolean;
  /** Called after the form has stored the new value (e.g. to derive another field). */
  onValueChange?: (value: string) => void;
  /** Translates the zod error key; defaults to `platform.errors`. */
  translateError?: (key: string) => string;
};

/**
 * Label above, input, hint, translated inline error (docs/DESIGN.md form rules).
 * Error messages are next-intl keys (`platform.errors` unless `translateError` is given).
 */
export function FormTextField<TValues extends FieldValues, TOutput>({
  form,
  name,
  label,
  description,
  optional,
  onValueChange,
  translateError,
  ...inputProps
}: Props<TValues, TOutput>) {
  const t = useTranslations("common");
  const tErrors = useTranslations("platform.errors");
  const error = form.getFieldState(name, form.formState).error?.message;
  const id = `field-${name}`;
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
          // Wizard steps validate with trigger() (no submit), so RHF would not re-check
          // on change: do it while an error is shown, so it clears once fixed.
          if (form.getFieldState(name).error) void form.trigger(name);
          onValueChange?.(e.target.value);
        }}
      />
      {description && <FieldDescription>{description}</FieldDescription>}
      {error && <FieldError>{translateError ? translateError(error) : tErrors(error)}</FieldError>}
    </Field>
  );
}
