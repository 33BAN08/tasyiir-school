"use client";

import { useTranslations } from "next-intl";
import { Controller, type Control } from "react-hook-form";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { ALERT_RECIPIENTS, type AlertRulesFormValues, type AlertRulesValues } from "@/lib/validations/alerts";

type Props = {
  control: Control<AlertRulesFormValues, unknown, AlertRulesValues>;
  rule: "unjustifiedAbsences" | "repeatedLateness";
  disabled: boolean;
};

/** Who is told: parents, surveillance, director (at least one, kept in that order). */
export function RecipientsField({ control, rule, disabled }: Props) {
  const t = useTranslations("alertSettings");

  return (
    <Controller
      control={control}
      name={`${rule}.recipients`}
      render={({ field, fieldState }) => (
        <FieldSet data-invalid={!!fieldState.error}>
          <FieldLegend variant="label">{t("recipients.title")}</FieldLegend>
          <div className="flex flex-col gap-3">
            {ALERT_RECIPIENTS.map((key) => {
              const id = `${rule}-recipient-${key}`;
              return (
                <Field key={key} orientation="horizontal" className="items-start">
                  <Checkbox
                    id={id}
                    className="mt-0.5"
                    checked={field.value.includes(key)}
                    disabled={disabled}
                    aria-describedby={`${id}-hint`}
                    onCheckedChange={(checked) =>
                      field.onChange(
                        checked
                          ? ALERT_RECIPIENTS.filter((k) => k === key || field.value.includes(k))
                          : field.value.filter((k) => k !== key),
                      )
                    }
                  />
                  <div className="flex flex-col gap-0.5">
                    <FieldLabel htmlFor={id} className="font-normal">
                      {t(`recipients.${key}`)}
                    </FieldLabel>
                    <FieldDescription id={`${id}-hint`}>{t(`recipients.${key}Hint`)}</FieldDescription>
                  </div>
                </Field>
              );
            })}
          </div>
          {fieldState.error?.message && <FieldError>{t(`errors.${fieldState.error.message}`)}</FieldError>}
        </FieldSet>
      )}
    />
  );
}
