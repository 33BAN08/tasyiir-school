"use client";

import { Ban } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LedgerCharge } from "@/lib/fees/ledger";
import { formatCentimes } from "@/lib/fees/money";
import { cancelPayment } from "@/lib/fees/payment-actions";
import type { LedgerPayment } from "@/lib/fees/payments";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PAYMENT_CANCEL_REASONS } from "@/lib/validations/fee-payments";

import { CancelReasonDialog } from "./cancel-reason-dialog";
import { useChargeLabel } from "./use-charge-label";

type Props = {
  payments: LedgerPayment[];
  charges: LedgerCharge[];
  serviceNames: Record<string, string>;
  /** fees.cancel */
  canCancel: boolean;
};

/** This year's receipts, newest first; a cancelled one keeps its row with the reason. */
export function PaymentHistory({ payments, charges, serviceNames, canCancel }: Props) {
  const t = useTranslations("fees.student.history");
  const tReason = useTranslations("fees.student.cancel.paymentReasons");
  const [cancelling, setCancelling] = useState<LedgerPayment | null>(null);
  const label = useChargeLabel(serviceNames);
  const locale = useLocale();
  const byId = new Map(charges.map((c) => [c.id, c]));
  const covered = (p: LedgerPayment) =>
    p.allocations
      .map((a) => byId.get(a.chargeId))
      .filter((c): c is LedgerCharge => !!c)
      .map((c) => label(c))
      .join(locale === "ar" ? "، " : ", ");

  return (
    <section className="flex flex-col gap-2" aria-labelledby="student-fee-history">
      <h3 id="student-fee-history" className="text-sm font-semibold">
        {t("title")}
      </h3>
      {payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {payments.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2"
              data-payment={p.id}
              data-payment-state={p.cancelled ? "cancelled" : "valid"}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span dir="ltr" className="whitespace-nowrap font-numeric text-sm font-medium">
                    {p.receiptLabel}
                  </span>
                  {p.cancelled && (
                    <Badge variant="outline" className="border-danger/40 text-danger">
                      <Ban aria-hidden />
                      {t("cancelled")}
                    </Badge>
                  )}
                </div>
                <span className="font-numeric text-xs text-muted-foreground">
                  {formatDate(p.paidOn)} · {t(`methods.${p.method}`)}
                  {p.bank && <> · <bdi>{p.bank}</bdi></>}
                  {p.reference && <> · <bdi>{t(p.method === "cheque" ? "chequeNo" : "reference", { value: p.reference })}</bdi></>}
                  {p.receivedBy && <> · <bdi>{t("receivedBy", { name: p.receivedBy })}</bdi></>}
                </span>
                <span className="text-xs text-muted-foreground">{covered(p)}</span>
                {p.cancelled && (
                  <span className="text-xs text-danger">
                    {t("cancelledBecause", { reason: tReason(p.cancelled.reason as Parameters<typeof tReason>[0]) })}
                    {p.cancelled.note && <> · <bdi>{p.cancelled.note}</bdi></>}
                    {p.cancelled.by && <> · <bdi>{p.cancelled.by}</bdi></>}
                  </span>
                )}
              </div>
              <span className={cn("font-numeric text-sm font-semibold tabular-nums", p.cancelled && "line-through text-muted-foreground")}>
                {formatCentimes(p.amount)}
              </span>
              {canCancel && !p.cancelled && (
                <Button variant="ghost" size="sm" className="min-h-11 text-danger" onClick={() => setCancelling(p)} data-payment-cancel>
                  {t("cancel")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {cancelling && (
        <CancelReasonDialog
          open
          onOpenChange={(next) => !next && setCancelling(null)}
          title={t("cancelTitle", { receipt: `⁦${cancelling.receiptLabel}⁩` })}
          description={t("cancelDescription", { amount: formatCentimes(cancelling.amount), charges: covered(cancelling) })}
          reasons={PAYMENT_CANCEL_REASONS}
          reasonLabel={(r) => tReason(r as Parameters<typeof tReason>[0])}
          confirmLabel={t("cancelConfirm")}
          done={t("cancelledToast")}
          action={(input) => cancelPayment(cancelling.id, input)}
          dataAttr="cancel-payment"
        />
      )}
    </section>
  );
}
