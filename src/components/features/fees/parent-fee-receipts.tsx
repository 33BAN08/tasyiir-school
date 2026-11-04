import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatCentimes } from "@/lib/fees/money";
import type { ParentReceiptRow } from "@/lib/fees/parent";
import { formatDate, ltr } from "@/lib/format";

/** The parent's receipts, newest first. A cancelled one stays listed with its date, no reason and no print. */
export function ParentFeeReceipts({ receipts }: { receipts: ParentReceiptRow[] }) {
  const t = useTranslations("portal.fees");
  const tReceipt = useTranslations("fees.receipt");

  if (receipts.length === 0) return <p className="text-sm text-muted-foreground">{t("receiptsEmpty")}</p>;
  return (
    <ul className="flex flex-col divide-y">
      {receipts.map((r) => (
        <li
          key={r.id}
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3"
          data-receipt-row={r.id}
          data-receipt-state={r.cancelled ? "cancelled" : "valid"}
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <span dir="ltr" className="self-start break-all font-code text-sm font-semibold rtl:self-end">{r.label}</span>
            <span className="text-xs text-muted-foreground">
              {ltr(formatDate(r.paidOn))} · {tReceipt(`methods.${r.method}`)}
            </span>
            {r.cancelled && r.cancelledOn && (
              <span className="text-xs font-medium text-danger">{t("receiptCancelled", { date: ltr(formatDate(r.cancelledOn)) })}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className={`font-numeric text-sm font-semibold tabular-nums ${r.cancelled ? "text-muted-foreground line-through" : ""}`}>
              {formatCentimes(r.amount)}
            </span>
            {!r.cancelled && (
              <Button asChild variant="outline" className="min-h-11">
                <Link href={`/print/my-receipts/${r.id}`} target="_blank" prefetch={false} aria-label={t("printLabel", { label: ltr(r.label) })} data-receipt-print>
                  <Printer aria-hidden />
                  {t("print")}
                </Link>
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
