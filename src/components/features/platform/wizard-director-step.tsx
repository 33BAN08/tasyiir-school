"use client";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Controller, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LOCALE_NAMES, routing } from "@/i18n/routing";
import { generateTemporaryPassword } from "@/lib/password";

import { CopyButton } from "./copy-button";
import { WizardTextField, type NewSchoolForm } from "./wizard-text-field";

export function WizardDirectorStep({ form }: { form: NewSchoolForm }) {
  const t = useTranslations("platform.wizard");
  const passwordError = form.formState.errors.directorPassword?.message;
  const password = useWatch({ control: form.control, name: "directorPassword" });

  return (
    <FieldGroup>
      <WizardTextField form={form} name="directorName" label={t("director.name")} autoComplete="off" />
      <WizardTextField
        form={form}
        name="directorEmail"
        label={t("director.email")}
        description={t("director.emailHint")}
        type="email"
        dir="ltr"
        autoComplete="off"
      />
      <Controller
        control={form.control}
        name="directorLocale"
        render={({ field }) => (
          <Field>
            <FieldLabel htmlFor="wizard-directorLocale">{t("director.locale")}</FieldLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="wizard-directorLocale" className="w-full sm:w-56">
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
      <Field data-invalid={!!passwordError}>
        <FieldLabel htmlFor="wizard-directorPassword">{t("director.password")}</FieldLabel>
        <div className="flex gap-2">
          <Input
            id="wizard-directorPassword"
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
            className="font-numeric"
            aria-invalid={!!passwordError}
            {...form.register("directorPassword")}
          />
          <CopyButton value={password} />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() =>
              form.setValue("directorPassword", generateTemporaryPassword(), { shouldValidate: true })
            }
          >
            <RefreshCw aria-hidden />
            <span className="sr-only">{t("director.regenerate")}</span>
          </Button>
        </div>
        <FieldDescription>{t("director.passwordHint")}</FieldDescription>
        {passwordError && <FieldError>{t(`errors.${passwordError}`)}</FieldError>}
      </Field>
    </FieldGroup>
  );
}
