"use client";

import { useLocale, useTranslations } from "next-intl";

import type { LedgerCharge } from "@/lib/fees/ledger";
import { shortMonth } from "@/lib/fees/months";

/** "Inscription", "Scolarité · oct. 2026", "Transport · oct. 2026". */
export function useChargeLabel(serviceNames: Record<string, string>): (c: LedgerCharge, withMonth?: boolean) => string {
  const t = useTranslations("fees.student.ledger");
  const locale = useLocale();
  return (c, withMonth = true) => {
    const name = c.kind === "registration" ? t("registration")
      : c.kind === "tuition" ? t("tuition")
        : (c.serviceId && serviceNames[c.serviceId]) || t("service");
    return withMonth && c.month ? `${name} · ${shortMonth(c.month, locale)}` : name;
  };
}
