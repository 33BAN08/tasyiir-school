"use client";

import { Banknote, Landmark, ScrollText, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Controller, useWatch, type UseFormReturn } from "react-hook-form";

import { FormDateField } from "@/components/features/forms/form-date-field";
import { FormTextField } from "@/components/features/forms/form-text-field";
import { cn } from "@/lib/utils";
import { PAYMENT_METHODS, type PaymentValues } from "@/lib/validations/fee-payments";

import { useFeesError } from "./use-fees-error";

export type PaymentForm = UseFormReturn<PaymentValues, unknown, PaymentValues>;

const METHOD_ICONS: Record<(typeof PAYMENT_METHODS)[number], LucideIcon> = {
  cash: Banknote,
  cheque: ScrollText,
  transfer: Landmark,
};

/** Method (cash / cheque / transfer) and its fields, the payment date, payer and note. */
export function PaymentFields({ form, disabled, year }: { form: PaymentForm; disabled: boolean; year: number }) {
  const t = useTranslations("fees.student.pay");
  const translateError = useFeesError();
  const method = useWatch({ control: form.control, name: "method" });

  return (
    <fieldset disabled={disabled} className="flex flex-col gap-6">
      <Controller
        control={form.control}
        name="method"
        render={({ field }) => (
          <div role="radiogroup" aria-label={t("method")} className="grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.map((m) => {
              const Icon = METHOD_ICONS[m];
              const on = field.value === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-method={m}
                  onClick={() => field.onChange(m)}
                  className={cn(
                    "flex min-h-11 flex-col items-center justify-center gap-1 rounded-md border px-2 py-2 text-sm",
                    on ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {t(`methods.${m}`)}
                </button>
              );
            })}
          </div>
        )}
      />
      {method !== "cash" && (
        <div className="grid gap-6 sm:grid-cols-2">
          <FormTextField
            form={form}
            name="bank"
            label={t("bank")}
            optional={method !== "cheque"}
            maxLength={60}
            translateError={translateError}
            className="min-h-11"
          />
          <FormTextField
            form={form}
            name="reference"
            label={method === "cheque" ? t("chequeNumber") : t("reference")}
            optional={method !== "cheque"}
            maxLength={60}
            dir="ltr"
            translateError={translateError}
            className="min-h-11"
          />
          {method === "cheque" && (
            <FormDateField
              form={form}
              name="chequeDate"
              label={t("chequeDate")}
              optional
              fromYear={year - 1}
              toYear={year + 1}
              translateError={translateError}
              size="touch"
            />
          )}
        </div>
      )}
      <div className="grid gap-6 sm:grid-cols-2">
        <FormDateField
          form={form}
          name="paidOn"
          label={t("paidOn")}
          description={t("paidOnHint")}
          fromYear={year - 1}
          toYear={year}
          translateError={translateError}
          size="touch"
        />
        <FormTextField form={form} name="payerName" label={t("payerName")} optional maxLength={100} className="min-h-11" translateError={translateError} />
      </div>
      <FormTextField form={form} name="note" label={t("note")} optional maxLength={200} className="min-h-11" translateError={translateError} />
    </fieldset>
  );
}
