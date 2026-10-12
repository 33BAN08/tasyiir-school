"use client";

import { useTranslations } from "next-intl";
import { Controller, useWatch } from "react-hook-form";

import { Badge } from "@/components/ui/badge";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/lib/format";
import type { PlanOption } from "@/lib/platform/plans";

import { FormTextField, type NewSchoolForm } from "./form-text-field";

type Props = { form: NewSchoolForm; plans: PlanOption[] };

export function WizardPlanStep({ form, plans }: Props) {
  const t = useTranslations("platform.wizard");
  const tModules = useTranslations("modules");
  const tErrors = useTranslations("platform.errors");
  const [planId, status] = useWatch({ control: form.control, name: ["planId", "subscriptionStatus"] });
  const plan = plans.find((p) => p.id === planId);
  const planError = form.formState.errors.planId?.message;

  return (
    <FieldGroup>
      <Controller
        control={form.control}
        name="planId"
        render={({ field }) => (
          <Field data-invalid={!!planError}>
            <FieldLabel htmlFor="wizard-planId">{t("plan.plan")}</FieldLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="wizard-planId" className="w-full" aria-invalid={!!planError}>
                <SelectValue placeholder={t("plan.choosePlan")} />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · <bdi className="font-numeric">{formatMoney(p.priceMonthly)}</bdi>{" "}
                    {t("plan.perMonth")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {plan && (
              <ul className="flex flex-wrap gap-1.5" aria-label={t("plan.includedModules")}>
                {plan.modules.map((key) => (
                  <li key={key}>
                    <Badge variant="secondary">{tModules(key)}</Badge>
                  </li>
                ))}
              </ul>
            )}
            {planError && <FieldError>{tErrors(planError)}</FieldError>}
          </Field>
        )}
      />
      <Controller
        control={form.control}
        name="subscriptionStatus"
        render={({ field }) => (
          <Field>
            <FieldLabel htmlFor="wizard-subscriptionStatus">{t("plan.status")}</FieldLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="wizard-subscriptionStatus" className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="trial">{t("plan.statusTrial")}</SelectItem>
                <SelectItem value="active">{t("plan.statusActive")}</SelectItem>
              </SelectContent>
            </Select>
            <FieldDescription>
              {status === "trial" ? t("plan.statusTrialHint") : t("plan.statusActiveHint")}
            </FieldDescription>
          </Field>
        )}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <FormTextField form={form} name="startDate" label={t("plan.startDate")} type="date" />
        {status === "trial" && (
          <FormTextField form={form} name="trialEndsOn" label={t("plan.trialEndsOn")} type="date" />
        )}
        <FormTextField form={form} name="endDate" label={t("plan.endDate")} type="date" optional />
      </div>
    </FieldGroup>
  );
}
