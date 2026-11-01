"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { StructureActionResult } from "@/lib/structure/action-utils";
import { cn } from "@/lib/utils";

import { useFeesError } from "./use-fees-error";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What is cancelled and what follows (months unpaid again, …), shown on both steps. */
  description: string;
  reasons: readonly string[];
  reasonLabel: (reason: string) => string;
  /** Second step's button, e.g. "Annuler le reçu". */
  confirmLabel: string;
  done: string;
  action: (input: { reason: string; note: string }) => Promise<StructureActionResult<null, "reason" | "note">>;
  dataAttr: string;
};

/** A reason code + note, then a confirm step; nothing is cancelled before the second button. */
export function CancelReasonDialog(props: Props) {
  const { open, onOpenChange, title, description, reasons, reasonLabel, confirmLabel, done, action, dataAttr } = props;
  const t = useTranslations("fees.student.cancel");
  const tCommon = useTranslations("common");
  const translateError = useFeesError();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [step, setStep] = useState<"reason" | "confirm">("reason");
  const [error, setError] = useState<{ field?: string; key: string } | null>(null);

  function close(next: boolean) {
    if (isPending) return;
    onOpenChange(next);
    if (!next) {
      setReason(null);
      setNote("");
      setStep("reason");
      setError(null);
    }
  }

  function next() {
    if (!reason) return setError({ field: "reason", key: "cancelReasonInvalid" });
    if (reason === "other" && !note.trim()) return setError({ field: "note", key: "cancelNoteRequired" });
    if (note.trim().length > 200) return setError({ field: "note", key: "tooLong" });
    setError(null);
    setStep("confirm");
  }

  function confirm() {
    if (!reason) return;
    startTransition(async () => {
      const result = await action({ reason, note });
      if (!result.ok) {
        setStep("reason");
        setError({ field: result.field, key: result.error });
        if (!result.field) toast.error(translateError(result.error));
        return;
      }
      toast.success(done);
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent showCloseButton={!isPending} {...{ [`data-${dataAttr}`]: step }}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {step === "reason" ? (
          <div className="flex flex-col gap-6">
            <fieldset className="flex flex-col gap-1" aria-invalid={error?.field === "reason"}>
              <legend className="mb-2 text-sm font-medium">{t("reason")}</legend>
              {reasons.map((r) => (
                <label
                  key={r}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3",
                    reason === r && "border-primary bg-primary/5",
                  )}
                >
                  <input
                    type="radio"
                    name="cancel-reason"
                    value={r}
                    checked={reason === r}
                    onChange={() => {
                      setReason(r);
                      setError(null);
                    }}
                    className="size-4 accent-[var(--primary)]"
                  />
                  <span className="text-sm">{reasonLabel(r)}</span>
                </label>
              ))}
              {error?.field === "reason" && <p className="text-sm text-danger">{translateError(error.key)}</p>}
            </fieldset>
            <Field data-invalid={error?.field === "note"}>
              <FieldLabel htmlFor="cancel-note">
                {t("note")}
                {reason !== "other" && <span className="font-normal text-muted-foreground">({tCommon("optional")})</span>}
              </FieldLabel>
              <Textarea
                id="cancel-note"
                value={note}
                maxLength={200}
                onChange={(e) => {
                  setNote(e.target.value);
                  setError(null);
                }}
                aria-invalid={error?.field === "note"}
              />
              {error?.field === "note" && <FieldError>{translateError(error.key)}</FieldError>}
            </Field>
          </div>
        ) : (
          <p className="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm">
            {t("confirmText", { reason: reason ? reasonLabel(reason) : "" })}
          </p>
        )}
        <DialogFooter>
          {step === "reason" ? (
            <>
              <Button variant="outline" className="min-h-11" onClick={() => close(false)}>
                {t("back")}
              </Button>
              <Button className="min-h-11" onClick={next} data-cancel-continue>
                {t("continue")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" className="min-h-11" disabled={isPending} onClick={() => setStep("reason")}>
                {t("previous")}
              </Button>
              <Button variant="destructive" className="min-h-11" disabled={isPending} onClick={confirm} data-cancel-confirm>
                {isPending ? t("saving") : confirmLabel}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
