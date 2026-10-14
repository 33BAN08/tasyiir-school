"use client";

import { CalendarDays, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { arMA, enUS, fr } from "react-day-picker/locale";
import { Controller, type FieldValues, type Path, type UseFormReturn } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const LOCALES = { ar: arMA, fr, en: enUS } as const;

// Arabic short day names are whole words (اثنين, ثلاثاء…) and overflow the
// day cells: use the one-letter forms (ن ث ر خ ج س ح) like Arabic calendars.
const arabicWeekday = new Intl.DateTimeFormat("ar-MA", { weekday: "narrow" });
const ARABIC_FORMATTERS = { formatWeekdayName: (day: Date) => arabicWeekday.format(day) };

/** `yyyy-MM-dd` ↔ local-midnight Date: calendar days only, no time zone shift. */
function toDate(value: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
}
function toIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

type Props<TValues extends FieldValues, TOutput> = {
  form: UseFormReturn<TValues, unknown, TOutput>;
  /** A `yyyy-MM-dd` string field ("" when empty). */
  name: Path<TValues>;
  label: string;
  description?: string;
  optional?: boolean;
  /** Years offered in the calendar's year list. Default: 100 years back → 10 years ahead. */
  fromYear?: number;
  toYear?: number;
  /** Translates the zod error key; defaults to `platform.errors`. */
  translateError?: (key: string) => string;
};

/**
 * Date field shown as dd/MM/yyyy in every UI language (docs/DESIGN.md), unlike
 * the native date input, which follows the browser's language. Calendar in a
 * popover: week starts Monday, month and day names in the UI language.
 */
export function FormDateField<TValues extends FieldValues, TOutput>({
  form,
  name,
  label,
  description,
  optional,
  fromYear,
  toYear,
  translateError,
}: Props<TValues, TOutput>) {
  const t = useTranslations("common");
  const tErrors = useTranslations("platform.errors");
  const locale = useLocale() as keyof typeof LOCALES;
  const [open, setOpen] = useState(false);
  const id = `field-${name}`;
  const thisYear = new Date().getFullYear();

  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => {
        const selected = toDate(field.value ?? "");
        const error = fieldState.error?.message;
        const change = (value: string) => {
          field.onChange(value);
          // Same as FormTextField: re-check while an error is shown, so it clears once fixed.
          if (form.getFieldState(name).error) void form.trigger(name);
        };

        return (
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor={id}>
              {label}
              {optional && <span className="font-normal text-muted-foreground">({t("optional")})</span>}
            </FieldLabel>
            <div className="flex gap-1">
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id={id}
                    ref={field.ref}
                    type="button"
                    variant="outline"
                    aria-invalid={!!error}
                    onBlur={field.onBlur}
                    className={cn(
                      "flex-1 justify-between font-normal aria-invalid:border-destructive",
                      !selected && "text-muted-foreground",
                    )}
                  >
                    {/* Digits stay left-to-right in Arabic too. */}
                    <span dir="ltr" className="font-numeric tabular-nums">
                      {selected ? formatDate(field.value) : t("datePlaceholder")}
                    </span>
                    <CalendarDays aria-hidden className="text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selected}
                    defaultMonth={selected}
                    onSelect={(date) => {
                      if (date) change(toIso(date));
                      setOpen(false);
                    }}
                    locale={LOCALES[locale] ?? fr}
                    dir={locale === "ar" ? "rtl" : "ltr"}
                    formatters={locale === "ar" ? ARABIC_FORMATTERS : undefined}
                    weekStartsOn={1}
                    captionLayout="dropdown"
                    startMonth={new Date(fromYear ?? thisYear - 100, 0)}
                    endMonth={new Date(toYear ?? thisYear + 10, 11)}
                  />
                </PopoverContent>
              </Popover>
              {optional && selected && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("clearDate", { label })}
                  onClick={() => change("")}
                >
                  <X aria-hidden />
                </Button>
              )}
            </div>
            {description && <FieldDescription>{description}</FieldDescription>}
            {error && <FieldError>{translateError ? translateError(error) : tErrors(error)}</FieldError>}
          </Field>
        );
      }}
    />
  );
}
