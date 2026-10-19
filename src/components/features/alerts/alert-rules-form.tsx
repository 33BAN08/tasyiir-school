"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarX2, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition, type ReactNode } from "react";
import { Controller, useForm, useWatch, type FieldPath } from "react-hook-form";
import { toast } from "sonner";

import { FormTextField } from "@/components/features/forms/form-text-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { useRouter } from "@/i18n/navigation";
import { saveAlertRules } from "@/lib/alerts/actions";
import { alertRulesSchema, type AlertRulesFormValues, type AlertRulesValues } from "@/lib/validations/alerts";

import { RecipientsField } from "./recipients-field";

type Props = { defaults: AlertRulesValues };

/** The director's two daily alerts: on / off, threshold, who is told. One save for both. */
export function AlertRulesForm({ defaults }: Props) {
  const t = useTranslations("alertSettings");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<AlertRulesFormValues, unknown, AlertRulesValues>({
    resolver: zodResolver(alertRulesSchema),
    defaultValues: defaults,
  });
  const values = useWatch({ control: form.control });
  const translateError = (key: string) => t(`errors.${key}`);

  const onSubmit = form.handleSubmit(() => {
    const raw = form.getValues(); // raw values: the action validates again
    startTransition(async () => {
      const result = await saveAlertRules(raw);
      if (!result.ok) {
        if (result.field) {
          form.setError(result.field as FieldPath<AlertRulesFormValues>, { message: result.error }, { shouldFocus: true });
        } else toast.error(translateError(result.error));
        return;
      }
      toast.success(t("saved"));
      form.reset(raw);
      router.refresh();
    });
  });

  const absencesOn = values.unjustifiedAbsences?.enabled ?? false;
  const latenessOn = values.repeatedLateness?.enabled ?? false;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <RuleCard
        icon={<CalendarX2 className="size-5 text-muted-foreground" aria-hidden />}
        title={t("absences.title")}
        description={t("absences.description")}
        toggle={<EnabledField form={form} rule="unjustifiedAbsences" disabled={isPending} />}
        summary={
          absencesOn
            ? t("absences.summary", { count: Number(values.unjustifiedAbsences?.threshold) || 0 })
            : t("off")
        }
      >
        <div className="grid gap-6 sm:max-w-xs">
          <FormTextField
            form={form}
            name="unjustifiedAbsences.threshold"
            label={t("absences.threshold")}
            description={t("absences.thresholdHint")}
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            disabled={isPending || !absencesOn}
            translateError={translateError}
          />
        </div>
        <RecipientsField control={form.control} rule="unjustifiedAbsences" disabled={isPending || !absencesOn} />
      </RuleCard>

      <RuleCard
        icon={<Clock className="size-5 text-muted-foreground" aria-hidden />}
        title={t("lateness.title")}
        description={t("lateness.description")}
        toggle={<EnabledField form={form} rule="repeatedLateness" disabled={isPending} />}
        summary={
          latenessOn
            ? t("lateness.summary", {
                count: Number(values.repeatedLateness?.threshold) || 0,
                days: Number(values.repeatedLateness?.windowDays) || 0,
              })
            : t("off")
        }
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <FormTextField
            form={form}
            name="repeatedLateness.threshold"
            label={t("lateness.threshold")}
            description={t("lateness.thresholdHint")}
            type="number"
            inputMode="numeric"
            min={2}
            max={20}
            disabled={isPending || !latenessOn}
            translateError={translateError}
          />
          <FormTextField
            form={form}
            name="repeatedLateness.windowDays"
            label={t("lateness.window")}
            description={t("lateness.windowHint")}
            type="number"
            inputMode="numeric"
            min={7}
            max={60}
            disabled={isPending || !latenessOn}
            translateError={translateError}
          />
        </div>
        <RecipientsField control={form.control} rule="repeatedLateness" disabled={isPending || !latenessOn} />
      </RuleCard>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {form.formState.isDirty && <p className="text-sm text-muted-foreground">{t("unsaved")}</p>}
        <Button type="submit" disabled={isPending || !form.formState.isDirty}>
          {isPending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}

type RuleCardProps = {
  icon: ReactNode;
  title: string;
  description: string;
  toggle: ReactNode;
  summary: string;
  children: ReactNode;
};

function RuleCard({ icon, title, description, toggle, summary, children }: RuleCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {toggle}
        <p className="rounded-lg bg-muted px-3 py-2 text-sm" aria-live="polite">
          {summary}
        </p>
        {children}
      </CardContent>
    </Card>
  );
}

type EnabledFieldProps = {
  form: ReturnType<typeof useForm<AlertRulesFormValues, unknown, AlertRulesValues>>;
  rule: "unjustifiedAbsences" | "repeatedLateness";
  disabled: boolean;
};

function EnabledField({ form, rule, disabled }: EnabledFieldProps) {
  const t = useTranslations("alertSettings");
  const id = `${rule}-enabled`;
  return (
    <Controller
      control={form.control}
      name={`${rule}.enabled`}
      render={({ field }) => (
        <Field orientation="horizontal">
          <Checkbox
            id={id}
            checked={field.value}
            disabled={disabled}
            onCheckedChange={(checked) => field.onChange(checked === true)}
          />
          <FieldLabel htmlFor={id}>{t("enabled")}</FieldLabel>
        </Field>
      )}
    />
  );
}
