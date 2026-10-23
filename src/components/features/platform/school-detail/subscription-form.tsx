"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/lib/format";
import type { PlanOption } from "@/lib/platform/plans";
import { updateSubscription } from "@/lib/platform/school-actions";
import {
  EDITABLE_SUBSCRIPTION_STATUSES,
  subscriptionSchema,
  type SubscriptionFormValues,
  type SubscriptionInput,
} from "@/lib/validations/platform";

import { FormDateField } from "@/components/features/forms/form-date-field";
import { FormTextField } from "@/components/features/forms/form-text-field";

type Props = {
  schoolId: string;
  plans: PlanOption[];
  defaults: SubscriptionFormValues;
  /** No subscription yet: saving creates one. */
  isNew: boolean;
};

export function SubscriptionForm({ schoolId, plans, defaults, isNew }: Props) {
  const t = useTranslations("platform.schoolDetail.subscription");
  const tPlan = useTranslations("platform.wizard.plan");
  const tStatus = useTranslations("platform.subscriptionStatus");
  const tErrors = useTranslations("platform.errors");
  const [isPending, startTransition] = useTransition();

  const form = useForm<SubscriptionFormValues, unknown, SubscriptionInput>({
    resolver: zodResolver(subscriptionSchema),
    defaultValues: defaults,
  });
  const status = useWatch({ control: form.control, name: "subscriptionStatus" });
  const planError = form.formState.errors.planId?.message;

  const onSubmit = form.handleSubmit(() => {
    const values = form.getValues();
    startTransition(async () => {
      const result = await updateSubscription(schoolId, values);
      if (!result.ok) {
        if (result.field) form.setError(result.field, { message: result.error });
        toast.error(tErrors(result.error));
        return;
      }
      form.reset(values);
      toast.success(t("saved"));
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        {isNew && <CardDescription>{t("none")}</CardDescription>}
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                control={form.control}
                name="planId"
                render={({ field }) => (
                  <Field data-invalid={!!planError}>
                    <FieldLabel htmlFor="field-planId">{tPlan("plan")}</FieldLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="field-planId" className="w-full" aria-invalid={!!planError}>
                        <SelectValue placeholder={tPlan("choosePlan")} />
                      </SelectTrigger>
                      <SelectContent>
                        {plans.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} · <bdi className="font-numeric">{formatMoney(p.priceMonthly)}</bdi>{" "}
                            {tPlan("perMonth")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {planError && <FieldError>{tErrors(planError)}</FieldError>}
                  </Field>
                )}
              />
              <Controller
                control={form.control}
                name="subscriptionStatus"
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="field-subscriptionStatus">{t("status")}</FieldLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="field-subscriptionStatus" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EDITABLE_SUBSCRIPTION_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {tStatus(s)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormDateField form={form} name="startDate" label={tPlan("startDate")} />
              {status === "trial" && (
                <FormDateField form={form} name="trialEndsOn" label={tPlan("trialEndsOn")} />
              )}
              <FormDateField form={form} name="endDate" label={tPlan("endDate")} optional />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormTextField
                form={form}
                name="maxStudentsOverride"
                label={t("maxStudentsOverride")}
                description={t("overrideHint")}
                inputMode="numeric"
                dir="ltr"
                className="font-numeric"
                optional
              />
              <FormTextField
                form={form}
                name="maxAdminsOverride"
                label={t("maxAdminsOverride")}
                description={t("overrideHint")}
                inputMode="numeric"
                dir="ltr"
                className="font-numeric"
                optional
              />
            </div>
          </FieldGroup>
          <div className="flex justify-end">
            <Button type="submit" disabled={isPending || (!isNew && !form.formState.isDirty)}>
              {isPending ? t("saving") : t("save")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
