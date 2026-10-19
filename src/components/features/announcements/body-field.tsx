"use client";

import { useTranslations } from "next-intl";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { BODY_MAX } from "@/lib/validations/announcements";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  error?: string;
  rows?: number;
};

/** The text of an announcement: a big box with a live character count. */
export function BodyField({ value, onChange, onBlur, error, rows = 8 }: Props) {
  const t = useTranslations("announcements.form");
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor="field-body">{t("body")}</FieldLabel>
      <Textarea
        id="field-body"
        dir="auto"
        rows={rows}
        value={value}
        aria-invalid={!!error}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      <FieldDescription className="tabular-nums">{t("count", { count: value.length, max: BODY_MAX })}</FieldDescription>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}
