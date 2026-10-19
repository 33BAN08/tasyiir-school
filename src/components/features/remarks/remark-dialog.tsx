"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MessageSquarePlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { Controller, useForm, type DefaultValues } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { isolate } from "@/lib/format";
import { createRemark, updateRemark } from "@/lib/remarks/actions";
import { cn } from "@/lib/utils";
import { REMARK_MAX, REMARK_TYPES, remarkSchema, type RemarkFormValues } from "@/lib/validations/remarks";

import { REMARK_ICONS, REMARK_TONE } from "./remark-type";
import { useRemarkError } from "./use-remark-error";

type Props = {
  studentId: string;
  studentName: string;
  /** Change this remark; write a new one when absent. */
  remark?: { id: string } & RemarkFormValues;
  /** Controlled from outside (edit from a menu); otherwise `trigger` / the default button opens it. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  /** Small button in a list row. */
  compact?: boolean;
};

/** Write (or change) a remark on one student: a type and a short text. Parents are told at once. */
export function RemarkDialog({ studentId, studentName, remark, open: openProp, onOpenChange, trigger, compact }: Props) {
  const t = useTranslations("remarks");
  const translateError = useRemarkError();
  const router = useRouter();
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;
  const [isPending, startTransition] = useTransition();
  const defaults: DefaultValues<RemarkFormValues> = remark ? { type: remark.type, body: remark.body } : { body: "" };
  const form = useForm<RemarkFormValues>({ resolver: zodResolver(remarkSchema), defaultValues: defaults });

  const onSubmit = form.handleSubmit(() => {
    const values = form.getValues();
    startTransition(async () => {
      const result = remark ? await updateRemark(remark.id, values) : await createRemark(studentId, values);
      if (!result.ok) {
        if (result.field) form.setError(result.field, { message: result.error }, { shouldFocus: true });
        else toast.error(translateError(result.error));
        return;
      }
      toast.success(remark ? t("form.updated") : t("form.created", { name: isolate(studentName) }));
      setOpen(false);
      form.reset(remark ? values : defaults);
      router.refresh();
    });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset(defaults);
      }}
    >
      {openProp === undefined && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button variant="outline" size={compact ? "sm" : "default"} className={compact ? "min-h-9" : "min-h-11"}>
              <MessageSquarePlus aria-hidden />
              {t(compact ? "addShort" : "add")}
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(remark ? "form.editTitle" : "form.createTitle")}</DialogTitle>
          <DialogDescription>
            {t(remark ? "form.editDescription" : "form.createDescription", { name: isolate(studentName) })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          <Controller
            control={form.control}
            name="type"
            render={({ field, fieldState }) => (
              <FieldSet data-invalid={!!fieldState.error}>
                <FieldLegend variant="label">{t("form.type")}</FieldLegend>
                <div role="radiogroup" className="grid grid-cols-2 gap-2">
                  {REMARK_TYPES.map((type) => {
                    const Icon = REMARK_ICONS[type];
                    const selected = field.value === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        data-remark-type={type}
                        onClick={() => field.onChange(type)}
                        className={cn(
                          "flex min-h-12 items-center gap-2 rounded-lg border px-3 text-start text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                          selected ? "border-primary bg-primary/10" : "hover:bg-muted",
                        )}
                      >
                        <Icon className={cn("size-5 shrink-0", REMARK_TONE[type])} aria-hidden />
                        {t(`types.${type}`)}
                      </button>
                    );
                  })}
                </div>
                {fieldState.error?.message && <FieldError>{translateError(fieldState.error.message)}</FieldError>}
              </FieldSet>
            )}
          />
          <Controller
            control={form.control}
            name="body"
            render={({ field, fieldState }) => (
              <Field data-invalid={!!fieldState.error}>
                <FieldLabel htmlFor="field-remark-body">{t("form.body")}</FieldLabel>
                <Textarea
                  id="field-remark-body"
                  dir="auto"
                  rows={4}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  aria-invalid={!!fieldState.error}
                />
                <FieldDescription className="tabular-nums">{t("form.count", { count: field.value.length, max: REMARK_MAX })}</FieldDescription>
                {fieldState.error?.message && <FieldError>{translateError(fieldState.error.message)}</FieldError>}
              </Field>
            )}
          />
          <p className="text-sm text-muted-foreground">{t("form.note")}</p>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                {t("form.cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("form.saving") : t(remark ? "form.save" : "form.send")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
