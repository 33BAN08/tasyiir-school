"use client";

import { Paperclip, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { JUSTIFICATION_FILE_TYPES } from "@/lib/justifications/rules";

type Props = {
  file: File | null;
  onChange: (file: File | null) => void;
  error: string | null;
  disabled?: boolean;
};

/** The optional note (photo or PDF) of a justification: choose, change, remove. Texts: `portal.absences.form`. */
export function NoteField({ file, onChange, error, disabled }: Props) {
  const t = useTranslations("portal.absences.form");
  const input = useRef<HTMLInputElement>(null);

  return (
    <Field data-invalid={!!error}>
      <FieldLabel>
        {t("file")}
        <span className="font-normal text-muted-foreground">({t("optional")})</span>
      </FieldLabel>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => input.current?.click()}>
          <Paperclip aria-hidden />
          {file ? t("changeFile") : t("chooseFile")}
        </Button>
        {file && (
          <span className="flex min-w-0 items-center gap-1 text-sm">
            <bdi className="truncate">{file.name}</bdi>
            <Button type="button" variant="ghost" size="icon-sm" disabled={disabled} aria-label={t("removeFile")} onClick={() => onChange(null)}>
              <X aria-hidden />
            </Button>
          </span>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept={JUSTIFICATION_FILE_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-label={t("chooseFile")}
        onChange={(e) => {
          const picked = e.target.files?.[0];
          e.target.value = ""; // picking the same file again still fires
          if (picked) onChange(picked);
        }}
      />
      <FieldDescription>{t("fileHint")}</FieldDescription>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}
