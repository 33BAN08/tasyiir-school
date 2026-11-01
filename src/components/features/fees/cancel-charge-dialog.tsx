"use client";

import { useTranslations } from "next-intl";

import { formatCentimes } from "@/lib/fees/money";
import { cancelCharge } from "@/lib/fees/payment-actions";
import { CHARGE_CANCEL_REASONS } from "@/lib/validations/fee-payments";

import { CancelReasonDialog } from "./cancel-reason-dialog";

type Props = {
  chargeId: string;
  chargeLabel: string;
  amount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Cancel one charge with no money on it (fees.cancel): it is no longer owed and never comes back. */
export function CancelChargeDialog({ chargeId, chargeLabel, amount, open, onOpenChange }: Props) {
  const t = useTranslations("fees.student.ledger");
  return (
    <CancelReasonDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("cancelChargeTitle", { charge: chargeLabel })}
      description={t("cancelChargeDescription", { amount: formatCentimes(amount) })}
      reasons={CHARGE_CANCEL_REASONS}
      reasonLabel={(r) => t(`chargeReasons.${r}` as Parameters<typeof t>[0])}
      confirmLabel={t("cancelChargeConfirm")}
      done={t("chargeCancelledToast")}
      action={(input) => cancelCharge(chargeId, input)}
      dataAttr="cancel-charge"
    />
  );
}
