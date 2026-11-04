import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { RECEIPT_PRINT_CSS, ReceiptSheet } from "@/components/features/fees/receipt-sheet";
import { ReceiptToolbar } from "@/components/features/fees/receipt-toolbar";
import { redirect } from "@/i18n/navigation";
import { getModules } from "@/lib/auth/modules";
import { homeFor } from "@/lib/auth/roles";
import { getCurrentSchool, requireUser } from "@/lib/auth/session";
import { getMyReceipt } from "@/lib/fees/parent";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("fees.receipt");
  return { title: t("pageTitle") };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A parent's copy of a valid receipt of their child (Phase 13 step 8). Always
 * a DUPLICATA and it records no print: the school's Original stays with the
 * school (print_no in receipt_prints counts staff prints only). Separate from
 * the staff page so a parent can never reach the code that records prints.
 */
export default function PrintMyReceiptPage({ params }: PageProps<"/[locale]/print/my-receipts/[id]">) {
  return (
    <Suspense>
      <PrintMyReceipt params={params} />
    </Suspense>
  );
}

async function PrintMyReceipt({ params }: Pick<PageProps<"/[locale]/print/my-receipts/[id]">, "params">) {
  const user = await requireUser();
  const [modules, { id }, school, locale, t] = await Promise.all([
    getModules(), params, getCurrentSchool(), getLocale(), getTranslations("portal.fees"),
  ]);
  if (!user.schoolId || !school || user.roleKey !== "parent" || !modules.has("fees")) {
    return redirect({ href: homeFor(user), locale });
  }
  if (!UUID.test(id)) notFound();
  // The receipt exists in French and Arabic only.
  if (locale !== "fr" && locale !== "ar") return redirect({ href: `/print/my-receipts/${id}`, locale: "fr" });

  const receipt = await getMyReceipt(user.schoolId, id);
  if (!receipt) notFound();

  return (
    <>
      <style>{RECEIPT_PRINT_CSS}</style>
      <ReceiptToolbar
        backHref={`/portal/fees?child=${receipt.student.id}`}
        backLabel={t("backToFees")}
        switchHref={`/print/my-receipts/${id}`}
        switchLocale={locale === "ar" ? "fr" : "ar"}
      />
      <main className="relative flex flex-1 flex-col items-start overflow-x-auto bg-muted p-4 sm:items-center sm:p-6 print:block print:overflow-visible print:bg-transparent print:p-0">
        <ReceiptSheet receipt={receipt} schoolName={school.name} language={locale} printNo={2} parentCopy />
      </main>
    </>
  );
}
