"use client";

import { Controller, type Control, type FieldValues, type Path } from "react-hook-form";

import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LOCALE_NAMES, routing } from "@/i18n/routing";

type Props<T extends FieldValues, TOutput> = {
  control: Control<T, unknown, TOutput>;
  name: Path<T>;
  id: string;
  label: string;
  disabled?: boolean;
};

/** Interface language of an account (ar / fr / en, each in its own language). */
export function LocaleField<T extends FieldValues, TOutput>({
  control,
  name,
  id,
  label,
  disabled,
}: Props<T, TOutput>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Field>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
            <SelectTrigger id={id} className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {routing.locales.map((locale) => (
                <SelectItem key={locale} value={locale}>
                  {LOCALE_NAMES[locale]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
    />
  );
}
