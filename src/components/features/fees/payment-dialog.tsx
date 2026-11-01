"use client";

import { CircleCheck, HandCoins, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";

import { FormTextField } from "@/components/features/forms/form-text-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Link, useRouter } from "@/i18n/navigation";
import { openCharges, type LedgerCharge, type LedgerTotals } from "@/lib/fees/ledger";
import { amountInputText, formatCentimes, parseAmount } from "@/lib/fees/money";
import { recordPayment, type RecordedPayment } from "@/lib/fees/payment-actions";
import { paymentSchema, type PaymentValues } from "@/lib/validations/fee-payments";

import { AllocationPicker, AllocationPreview, picksToAllocations, type Picks } from "./payment-allocation";
import { PaymentFields } from "./payment-fields";
import { useFeesError } from "./use-fees-error";

type Props = {
  studentId: string;
  yearId: string;
  /** The school's today (`yyyy-MM-dd`, from the database). */
  today: string;
  charges: LedgerCharge[];
  totals: LedgerTotals;
  serviceNames: Record<string, string>;
};

const shiftDay = (day: string, by: number) => new Date(Date.parse(`${day}T12:00:00Z`) + by * 86_400_000).toISOString().slice(0, 10);

/**
 * "Encaisser" (fees.manage). The idempotency key is made when the dialog
 * opens and kept until the database answers: a refusal (nothing saved) gives
 * the next try a new key; a lost answer locks the form and "Réessayer" sends
 * the same payment with the same key (the database returns the first one).
 */
export function PaymentDialog({ studentId, yearId, today, charges, totals, serviceNames }: Props) {
  const t = useTranslations("fees.student.pay");
  const translateError = useFeesError();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [isPending, startTransition] = useTransition();
  const [picking, setPicking] = useState(false);
  const [picks, setPicks] = useState<Picks>({});
  const [locked, setLocked] = useState<{ values: PaymentValues; error: string } | null>(null);
  const [done, setDone] = useState<RecordedPayment | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const defaults: PaymentValues = {
    amount: "", method: "cash", paidOn: today, bank: "", reference: "", chequeDate: "", payerName: "", note: "", allocations: null,
  };
  const form = useForm<PaymentValues, unknown, PaymentValues>({ defaultValues: defaults });
  const openList = openCharges(charges);
  const typed = parseAmount(useWatch({ control: form.control, name: "amount" }) ?? "");
  const picked = picking ? picksToAllocations(openList, picks) : null;
  const pickedTotal = picked?.reduce((s, a) => s + a.amount, 0) ?? 0;

  function change(next: boolean) {
    if (isPending) return;
    setOpen(next);
    if (next) {
      setKey(crypto.randomUUID());
      return;
    }
    form.reset(defaults);
    setPicking(false);
    setPicks({});
    setLocked(null);
    setDone(null);
    setFormError(null);
  }

  function send(values: PaymentValues) {
    setFormError(null);
    startTransition(async () => {
      let result;
      try {
        result = await recordPayment(studentId, yearId, values, key);
      } catch {
        result = { ok: false as const, error: "generic" };
      }
      if (result.ok) {
        setLocked(null);
        setDone(result.data);
        router.refresh();
        return;
      }
      if (result.error === "generic" || result.error === "idempotencyConflict") {
        // Saved or not is unknown: same key, same payment, nothing editable.
        setLocked({ values, error: result.error });
        return;
      }
      setKey(crypto.randomUUID());
      if (result.field && result.field !== "allocations") form.setError(result.field, { message: result.error }, { shouldFocus: true });
      else setFormError(result.error);
    });
  }

  const submit = form.handleSubmit((raw) => {
    const values = { ...raw, allocations: picking ? picked : null };
    if (picking && (!picked || picked.length === 0)) return setFormError(picked ? "allocationRequired" : "allocationInvalid");
    if (raw.paidOn < shiftDay(today, -7) || raw.paidOn > today) {
      return form.setError("paidOn", { message: "paidOnInvalid" }, { shouldFocus: true });
    }
    const parsed = paymentSchema.safeParse(values);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path[0] as keyof PaymentValues | undefined;
      if (field && field !== "allocations") form.setError(field, { message: issue.message }, { shouldFocus: true });
      else setFormError(issue?.message ?? "generic");
      return;
    }
    send(values);
  });

  const quick = (amount: number, text: string) =>
    amount > 0 && (
      <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={isPending || !!locked}
        onClick={() => form.setValue("amount", amountInputText(amount), { shouldValidate: false })}>
        {text}
      </Button>
    );

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger asChild>
        <Button className="min-h-11" disabled={totals.balance <= 0} data-pay-open>
          <HandCoins aria-hidden />
          {t("open")}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={!isPending} className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl" data-pay-dialog={done ? "done" : "form"}>
        {done ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center" data-pay-done={done.receiptLabel}>
            <CircleCheck className="size-10 text-success" aria-hidden />
            <DialogHeader className="items-center">
              <DialogTitle>{t(done.replayed ? "doneReplayedTitle" : "doneTitle")}</DialogTitle>
              <DialogDescription>{t("doneDescription")}</DialogDescription>
            </DialogHeader>
            <p dir="ltr" className="font-numeric text-2xl font-semibold" data-receipt-label>
              {done.receiptLabel}
            </p>
            <DialogFooter className="w-full">
              <Button asChild variant="outline" className="min-h-11">
                <Link href={`/print/receipts/${done.paymentId}`} target="_blank" prefetch={false} data-receipt-print>
                  <Printer aria-hidden />
                  {t("print")}
                </Link>
              </Button>
              <Button className="min-h-11" onClick={() => change(false)}>
                {t("close")}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-6">
            <DialogHeader>
              <DialogTitle>{t("title")}</DialogTitle>
              <DialogDescription className="font-numeric">
                {t("description", { due: formatCentimes(totals.dueNow), balance: formatCentimes(totals.balance) })}
              </DialogDescription>
            </DialogHeader>
            <fieldset disabled={isPending || !!locked} className="flex flex-col gap-4">
              <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
                {t("pickMode")}
                <Checkbox checked={picking} onCheckedChange={(on) => { setPicking(on === true); setFormError(null); }} data-pick-mode />
              </label>
              {picking ? (
                <>
                  <AllocationPicker open={openList} picks={picks} onChange={(p) => { setPicks(p); setFormError(null); }}
                    serviceNames={serviceNames} disabled={isPending || !!locked} invalid={!!formError} />
                  <p className="flex items-baseline justify-between text-sm font-medium" data-picked-total={pickedTotal}>
                    {t("pickedTotal")}
                    <span className="font-numeric tabular-nums">{picked ? formatCentimes(pickedTotal) : "—"}</span>
                  </p>
                </>
              ) : (
                <>
                  <FormTextField form={form} name="amount" label={t("amount")} inputMode="decimal" dir="ltr"
                    className="min-h-11 font-numeric tabular-nums" translateError={translateError} />
                  <div className="flex flex-wrap gap-2">
                    {quick(totals.dueNow, t("fillDue"))}
                    {totals.balance !== totals.dueNow && quick(totals.balance, t("fillBalance"))}
                  </div>
                  <AllocationPreview open={openList} amount={typed} serviceNames={serviceNames} />
                </>
              )}
            </fieldset>
            <PaymentFields form={form} disabled={isPending || !!locked} year={Number(today.slice(0, 4))} />
            {(formError || locked) && (
              <p role="alert" className="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger" data-pay-error={locked?.error ?? formError}>
                {locked ? t(locked.error === "generic" ? "lostAnswer" : "conflict") : translateError(formError ?? "generic")}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" className="min-h-11" disabled={isPending} onClick={() => change(false)}>
                {t("cancel")}
              </Button>
              {locked?.error === "generic" ? (
                <Button type="button" className="min-h-11" disabled={isPending} onClick={() => send(locked.values)} data-pay-retry>
                  {isPending ? t("saving") : t("retry")}
                </Button>
              ) : (
                <Button type="submit" className="min-h-11" disabled={isPending || !!locked} data-pay-submit>
                  {isPending ? t("saving") : t("submit")}
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
