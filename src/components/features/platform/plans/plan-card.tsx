"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { School } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import type { PlanAdmin } from "@/lib/platform/plans";
import { updatePlan } from "@/lib/platform/plan-actions";
import { planSchema, type PlanFormValues, type PlanInput } from "@/lib/validations/platform";

import { FormTextField } from "../form-text-field";

type Props = { plan: PlanAdmin; moduleKeys: string[] };

function toFormValues(plan: PlanAdmin): PlanFormValues {
  return {
    name: plan.name,
    priceMonthly: plan.priceMonthly.toFixed(2),
    priceYearly: plan.priceYearly.toFixed(2),
    maxStudents: plan.maxStudents === null ? "" : String(plan.maxStudents),
    isActive: plan.isActive,
    modules: plan.modules,
  };
}

export function PlanCard({ plan, moduleKeys }: Props) {
  const t = useTranslations("platform.plans");
  const tModules = useTranslations("modules");
  const tErrors = useTranslations("platform.errors");
  const [isPending, startTransition] = useTransition();

  const form = useForm<PlanFormValues, unknown, PlanInput>({
    resolver: zodResolver(planSchema),
    defaultValues: toFormValues(plan),
  });
  const modulesError = form.formState.errors.modules?.message;

  const onSubmit = form.handleSubmit(() => {
    const values = form.getValues(); // raw values: the action validates again
    startTransition(async () => {
      const result = await updatePlan(plan.id, values);
      if (!result.ok) {
        if (result.field) form.setError(result.field, { message: result.error });
        toast.error(tErrors(result.error));
        return;
      }
      form.reset(values);
      toast.success(t("saved", { name: values.name.trim() }));
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {plan.name}
          <Badge variant={plan.isActive ? "secondary" : "outline"}>
            {plan.isActive ? t("active") : t("inactive")}
          </Badge>
        </CardTitle>
        <CardDescription className="flex items-center gap-1.5">
          <School className="size-4" aria-hidden />
          {t("schoolCount", { count: plan.schoolCount })}
        </CardDescription>
        <CardAction>
          <bdi className="font-numeric text-sm text-muted-foreground">{plan.key}</bdi>
        </CardAction>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          <FieldGroup>
            <FormTextField form={form} name="name" label={t("name")} />
            <div className="grid gap-4 sm:grid-cols-3">
              <FormTextField
                form={form}
                name="priceMonthly"
                label={t("priceMonthly")}
                inputMode="decimal"
                dir="ltr"
                className="font-numeric"
              />
              <FormTextField
                form={form}
                name="priceYearly"
                label={t("priceYearly")}
                inputMode="decimal"
                dir="ltr"
                className="font-numeric"
              />
              <FormTextField
                form={form}
                name="maxStudents"
                label={t("maxStudents")}
                description={t("maxStudentsHint")}
                inputMode="numeric"
                dir="ltr"
                className="font-numeric"
                optional
              />
            </div>

            <Controller
              control={form.control}
              name="modules"
              render={({ field }) => (
                <FieldSet data-invalid={!!modulesError}>
                  <FieldLegend variant="label">{t("modules")}</FieldLegend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {moduleKeys.map((key) => (
                      <Field key={key} orientation="horizontal">
                        <Checkbox
                          id={`plan-${plan.id}-${key}`}
                          checked={field.value.includes(key)}
                          onCheckedChange={(checked) =>
                            field.onChange(
                              checked
                                ? moduleKeys.filter((k) => k === key || field.value.includes(k))
                                : field.value.filter((k) => k !== key),
                            )
                          }
                        />
                        <FieldLabel htmlFor={`plan-${plan.id}-${key}`} className="font-normal">
                          {tModules(key)}
                        </FieldLabel>
                      </Field>
                    ))}
                  </div>
                  {modulesError && <FieldError>{tErrors(modulesError)}</FieldError>}
                </FieldSet>
              )}
            />

            <Controller
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Checkbox
                    id={`plan-${plan.id}-active`}
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                  <FieldContent>
                    <FieldLabel htmlFor={`plan-${plan.id}-active`}>{t("isActive")}</FieldLabel>
                    <FieldDescription>{t("isActiveHint")}</FieldDescription>
                  </FieldContent>
                </Field>
              )}
            />
          </FieldGroup>
          <div className="flex justify-end">
            <Button type="submit" disabled={isPending || !form.formState.isDirty}>
              {isPending ? t("saving") : t("save")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
