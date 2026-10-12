"use client";

import { useTranslations } from "next-intl";

import { FieldGroup } from "@/components/ui/field";
import { slugify } from "@/lib/validations/platform";

import { WizardTextField, type NewSchoolForm } from "./wizard-text-field";

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
      <WizardTextField
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
      <WizardTextField
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
        <WizardTextField form={form} name="city" label={t("city")} optional />
        <WizardTextField form={form} name="phone" label={t("phone")} type="tel" dir="ltr" optional />
      </div>
      <WizardTextField form={form} name="address" label={t("address")} optional />
    </FieldGroup>
  );
}
