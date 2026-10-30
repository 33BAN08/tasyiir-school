"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";
import { saveStudentDiscount } from "@/lib/fees/student-actions";
import { cn } from "@/lib/utils";
import { DISCOUNT_TARGETS, type DiscountKind, type DiscountTarget } from "@/lib/validations/fees";

import { useFeesError } from "./use-fees-error";

export type DiscountDraft = {
  kind: DiscountKind;
  mode: "percent" | "amount";
  value: string;
  appliesTo: DiscountTarget;
  reason: string;
};

type Props = {
  studentId: string;
  yearId: string;
  /** Change this discount (its kind stays); add a new one when absent. */
  discountId?: string;
  /** Kinds the student does not have yet (add), or the discount's own kind (edit). */
  kinds: DiscountKind[];
  defaults: DiscountDraft;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: ReactNode;
};

/** A discount: kind, percent or amount (taken off each month), what it applies to, the reason. */
export function DiscountDialog({ studentId, yearId, discountId, kinds, defaults, open, onOpenChange, trigger }: Props) {
  const t = useTranslations("fees.student.discounts");
  const translateError = useFeesError();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState(defaults);
  const [error, setError] = useState<{ field?: string; key: string } | null>(null);
  const mode = draft.kind === "fixed" ? "amount" : draft.mode;
  const set = (patch: Partial<DiscountDraft>) => {
    setError(null);
    setDraft((d) => ({ ...d, ...patch }));
  };

  function reset(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setDraft(defaults);
      setError(null);
    }
  }

  function save() {
    startTransition(async () => {
      const result = await saveStudentDiscount(studentId, yearId, { ...draft, mode }, discountId);
      if (!result.ok) {
        setError({ field: result.field, key: result.error });
        if (!result.field) toast.error(translateError(result.error));
        return;
      }
      toast.success(t("form.saved"));
      reset(false);
      router.refresh();
    });
  }

  const valueLabel =
    mode === "percent" ? t("form.percent") : draft.appliesTo === "registration" ? t("form.amountOnce") : t("form.amount");

  return (
    <Dialog open={open} onOpenChange={reset}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {discountId ? t("form.editTitle", { kind: t(`kinds.${defaults.kind}`) }) : t("form.addTitle")}
          </DialogTitle>
          <DialogDescription>{t("form.description")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="discount-kind">{t("form.kind")}</FieldLabel>
              <Select
                value={draft.kind}
                onValueChange={(v) => set({ kind: v as DiscountKind })}
                disabled={isPending || !!discountId}
              >
                <SelectTrigger id="discount-kind" className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {kinds.map((k) => (
                    <SelectItem key={k} value={k}>
                      {t(`kinds.${k}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="discount-target">{t("form.appliesTo")}</FieldLabel>
              <Select value={draft.appliesTo} onValueChange={(v) => set({ appliesTo: v as DiscountTarget })} disabled={isPending}>
                <SelectTrigger id="discount-target" className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISCOUNT_TARGETS.map((target) => (
                    <SelectItem key={target} value={target}>
                      {t(`targets.${target}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {draft.kind !== "fixed" && (
            <div role="radiogroup" aria-label={t("form.mode")} className="flex w-fit gap-1 rounded-lg bg-muted p-1">
              {(["percent", "amount"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  disabled={isPending}
                  onClick={() => set({ mode: m, value: "" })}
                  className={cn(
                    "min-h-11 rounded-md px-3 text-sm transition-colors",
                    mode === m ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`form.modes.${m}`)}
                </button>
              ))}
            </div>
          )}

          <Field data-invalid={error?.field === "value"} className="sm:max-w-56">
            <FieldLabel htmlFor="discount-value">{valueLabel}</FieldLabel>
            <Input
              id="discount-value"
              inputMode="decimal"
              dir="ltr"
              autoComplete="off"
              className="min-h-11 font-numeric tabular-nums"
              value={draft.value}
              aria-invalid={error?.field === "value"}
              disabled={isPending}
              onChange={(e) => set({ value: e.target.value })}
            />
            {error?.field === "value" && <FieldError>{translateError(error.key)}</FieldError>}
          </Field>

          <Field data-invalid={error?.field === "reason"}>
            <FieldLabel htmlFor="discount-reason">{t("form.reason")}</FieldLabel>
            <Input
              id="discount-reason"
              className="min-h-11"
              autoComplete="off"
              maxLength={200}
              value={draft.reason}
              aria-invalid={error?.field === "reason"}
              disabled={isPending}
              onChange={(e) => set({ reason: e.target.value })}
            />
            {error?.field === "reason" && <FieldError>{translateError(error.key)}</FieldError>}
          </Field>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" className="min-h-11" disabled={isPending}>
              {t("form.cancel")}
            </Button>
          </DialogClose>
          <Button className="min-h-11" onClick={save} disabled={isPending || draft.value.trim() === ""}>
            {isPending ? t("form.saving") : t("form.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
