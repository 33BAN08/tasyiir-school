"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormDateField } from "@/components/features/forms/form-date-field";
import { Button } from "@/components/ui/button";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { MAX_JOURNAL_DAYS } from "@/lib/fees/report-rules";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "required");
const schema = z
  .object({ from: day, to: day })
  .refine(
    (v) => v.from <= v.to && (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 <= MAX_JOURNAL_DAYS,
    { message: "range", path: ["to"] },
  );
type Values = z.infer<typeof schema>;

/** The journal's dates (`?from=&to=`), at most 366 days; "Ce mois" goes back to this month. */
export function JournalRange({ from, to }: { from: string; to: string }) {
  const t = useTranslations("fees.journal");
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { from, to } });
  const translateError = (key: string) => t(`errors.${key === "range" ? "range" : "required"}`);

  return (
    <form
      noValidate
      className="flex flex-wrap items-start gap-3"
      data-journal-range
      onSubmit={form.handleSubmit((v) => startTransition(() => router.replace(`${pathname}?from=${v.from}&to=${v.to}`)))}
    >
      <div className="w-44">
        <FormDateField form={form} name="from" label={t("from")} size="touch" translateError={translateError} />
      </div>
      <div className="w-44">
        <FormDateField form={form} name="to" label={t("to")} size="touch" translateError={translateError} />
      </div>
      <div className="flex gap-2 self-end pb-px">
        <Button type="submit" className="min-h-11" disabled={isPending}>{t("show")}</Button>
        <Button asChild variant="ghost" className="min-h-11">
          <Link href={pathname}>{t("thisMonth")}</Link>
        </Button>
      </div>
    </form>
  );
}
