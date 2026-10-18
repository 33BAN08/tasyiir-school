"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FilePlus2, Paperclip, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormDateField } from "@/components/features/forms/form-date-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { isolate } from "@/lib/format";
import { submitJustification } from "@/lib/justifications/actions";
import { prepareJustificationFile } from "@/lib/justifications/prepare-file";
import { JUSTIFICATION_BUCKET, JUSTIFICATION_FILE_TYPES, justificationPath } from "@/lib/justifications/rules";
import { createClient } from "@/lib/supabase/client";
import { justificationSchema, type JustificationFormValues } from "@/lib/validations/justifications";

import { useJustificationError } from "./use-justification-error";

type Props = {
  schoolId: string;
  studentId: string;
  childName: string;
  /** The school's today ("yyyy-MM-dd", from the database): the form's first and last day start there. */
  today: string;
  /** The day to justify (an absence the parent tapped); today when absent. */
  date?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm";
  /** Button text; "Justifier une absence" by default. */
  label?: string;
};

/**
 * A parent justifies whole days for their child: from–to, a reason, an
 * optional note (photo or PDF). The note is prepared in the browser (photos
 * re-encoded: no GPS), uploaded with the parent's own session, then the
 * Server Action saves the justification as "pending" and removes the file
 * again if it fails.
 */
export function JustifyDialog({ schoolId, studentId, childName, today, date, variant = "default", size = "default", label }: Props) {
  const t = useTranslations("portal.absences.form");
  const translateError = useJustificationError();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const defaults: JustificationFormValues = { fromDate: date ?? today, toDate: date ?? today, reason: "" };
  const form = useForm<JustificationFormValues>({ resolver: zodResolver(justificationSchema), defaultValues: defaults });
  const year = Number(today.slice(0, 4));
  const reasonError = form.formState.errors.reason?.message;

  function reset() {
    form.reset(defaults);
    setFile(null);
    setFileError(null);
  }

  const onSubmit = form.handleSubmit(() => {
    const values = form.getValues();
    startTransition(async () => {
      let path: string | null = null;
      if (file) {
        const prepared = await prepareJustificationFile(file);
        if ("error" in prepared) {
          setFileError(translateError(prepared.error));
          return;
        }
        path = justificationPath(schoolId, studentId, crypto.randomUUID(), prepared.ext);
        const { error } = await createClient()
          .storage.from(JUSTIFICATION_BUCKET)
          .upload(path, prepared.blob, { contentType: prepared.blob.type, upsert: false });
        if (error) {
          setFileError(translateError("fileUpload"));
          return;
        }
      }
      const result = await submitJustification(studentId, values, path);
      if (!result.ok) {
        if (result.field) form.setError(result.field, { message: result.error }, { shouldFocus: true });
        else toast.error(translateError(result.error));
        if (result.error === "fileUpload") setFileError(translateError("fileUpload"));
        return;
      }
      toast.success(t("sent"));
      setOpen(false);
      reset();
      router.refresh();
    });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className="min-h-11">
          <FilePlus2 aria-hidden />
          {label ?? t("open")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description", { name: isolate(childName) })}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormDateField
              form={form}
              name="fromDate"
              label={t("from")}
              fromYear={year - 1}
              toYear={year + 1}
              translateError={translateError}
            />
            <FormDateField
              form={form}
              name="toDate"
              label={t("to")}
              fromYear={year - 1}
              toYear={year + 1}
              translateError={translateError}
            />
          </div>
          <Field data-invalid={!!reasonError}>
            <FieldLabel htmlFor="field-reason">{t("reason")}</FieldLabel>
            <Textarea
              id="field-reason"
              rows={3}
              maxLength={500}
              aria-invalid={!!reasonError}
              placeholder={t("reasonPlaceholder")}
              {...form.register("reason")}
            />
            {reasonError && <FieldError>{translateError(reasonError)}</FieldError>}
          </Field>
          <Field data-invalid={!!fileError}>
            <FieldLabel>
              {t("file")}
              <span className="font-normal text-muted-foreground">({t("optional")})</span>
            </FieldLabel>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => input.current?.click()}>
                <Paperclip aria-hidden />
                {file ? t("changeFile") : t("chooseFile")}
              </Button>
              {file && (
                <span className="flex min-w-0 items-center gap-1 text-sm">
                  <bdi className="truncate">{file.name}</bdi>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={isPending}
                    aria-label={t("removeFile")}
                    onClick={() => {
                      setFile(null);
                      setFileError(null);
                    }}
                  >
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
                if (picked) {
                  setFile(picked);
                  setFileError(null);
                }
              }}
            />
            <FieldDescription>{t("fileHint")}</FieldDescription>
            {fileError && <FieldError>{fileError}</FieldError>}
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("sending") : t("send")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
