"use client";

import { useTranslations } from "next-intl";

import { FieldGroup } from "@/components/ui/field";
import { slugify } from "@/lib/validations/platform";

import { FormTextField } from "@/components/features/forms/form-text-field";

import type { NewSchoolForm } from "./wizard-form";

type Props = {
  form: NewSchoolForm;
  /** Once the identifier is edited by hand, the name stops overwriting it. */
  slugEdited: boolean;
  onSlugEdited: () => void;
};

export function WizardSchoolStep({ form, slugEdited, onSlugEdited }: Props) {
  const t = useTranslations("platform.wizard.school");
  return (
    <FieldGroup>
      <FormTextField
        form={form}
        name="name"
        label={t("name")}
        autoComplete="organization"
        onValueChange={(value) => {
          if (!slugEdited) {
            form.setValue("slug", slugify(value), { shouldValidate: !!form.formState.errors.slug });
          }
        }}
      />
      <FormTextField
        form={form}
        name="slug"
        label={t("slug")}
        description={t("slugHint")}
        dir="ltr"
        autoCapitalize="none"
        spellCheck={false}
        onValueChange={onSlugEdited}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormTextField form={form} name="city" label={t("city")} optional />
        <FormTextField form={form} name="phone" label={t("phone")} type="tel" dir="ltr" optional />
      </div>
      <FormTextField form={form} name="address" label={t("address")} optional />
    </FieldGroup>
  );
}
