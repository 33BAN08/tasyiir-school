import { HandCoins, Wallet } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { formatCentimes } from "@/lib/fees/money";
import type { FeeSummary } from "@/lib/fees/reports";

import { StatTile } from "./dashboard-parts";

/** "Encaissé ce mois" (→ the journal) and "Impayés à date" (→ the unpaid list): fees.view + the fees module. */
export async function FeeTiles({ fees }: { fees: FeeSummary }) {
  const t = await getTranslations("dashboard.tiles");
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-fee-tiles>
      <StatTile name="collected" icon={HandCoins} tone="brand" label={t("collected")} value={formatCentimes(fees.collectedMonth)}
        sub={t("collectedReceipts", { count: fees.receiptsMonth })} href="/fees/journal" money />
      <StatTile name="unpaid" icon={Wallet} tone="danger" label={t("unpaid")} value={formatCentimes(fees.unpaid)}
        sub={t("unpaidStudents", { count: fees.unpaidStudents })} href="/fees" money />
    </div>
  );
}
