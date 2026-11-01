import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { ReceiptSheet } from "@/components/features/fees/receipt-sheet";
import { ReceiptToolbar } from "@/components/features/fees/receipt-toolbar";
import { redirect } from "@/i18n/navigation";
import { getModules } from "@/lib/auth/modules";
import { areaFor, homeFor } from "@/lib/auth/roles";
import { getCurrentSchool, getPermissions, requireUser } from "@/lib/auth/session";
import { getReceipt, openReceiptPrint } from "@/lib/fees/receipt";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("fees.receipt");
  return { title: t("pageTitle") };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A payment receipt to print or save as PDF (Phase 13 step 5b), A5 portrait,
 * in French or Arabic (an English UI opens the French one). Staff with
 * fees.view. Every opening records a print (1 = ORIGINAL, then DUPLICATA),
 * except the FR ⇄ AR switch, which re-uses the print it came from
 * (`?print=…`, same person, < 10 min). Links to this page never prefetch.
 */
export default function PrintReceiptPage({ params, searchParams }: PageProps<"/[locale]/print/receipts/[id]">) {
  return (
    <Suspense>
      <PrintReceipt params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function PrintReceipt({ params, searchParams }: Pick<PageProps<"/[locale]/print/receipts/[id]">, "params" | "searchParams">) {
  const user = await requireUser();
  const [permissions, modules, { id }, sp, school, locale] = await Promise.all([
    getPermissions(), getModules(), params, searchParams, getCurrentSchool(), getLocale(),
  ]);
  if (!user.schoolId || !school || areaFor(user) !== "school" || !modules.has("fees") || !permissions.has("fees.view")) {
    return redirect({ href: homeFor(user), locale });
  }
  if (!UUID.test(id)) notFound();
  const fromPrint = typeof sp.print === "string" && UUID.test(sp.print) ? sp.print : null;
  // The receipt exists in French and Arabic only.
  if (locale !== "fr" && locale !== "ar") {
    return redirect({ href: { pathname: `/print/receipts/${id}`, query: fromPrint ? { print: fromPrint } : {} }, locale: "fr" });
  }

  const receipt = await getReceipt(user.schoolId, id);
  if (!receipt) notFound();
  const print = await openReceiptPrint(id, user.id, locale, fromPrint);
  const other = locale === "ar" ? "fr" : "ar";

  return (
    <>
      {/* A5 portrait, 8 mm margins: the sheet is 132 × 194 mm. */}
      <style>
        {"@page { size: A5 portrait; margin: 8mm; }" +
          "@media print { html, body { height: auto !important; min-height: 0 !important; background: none !important; }" +
          " body > :not(main) { display: none !important; } }"}
      </style>
      <ReceiptToolbar
        backHref={`/students/${receipt.student.id}`}
        switchHref={`/print/receipts/${id}?print=${print.id}`}
        switchLocale={other}
      />
      <main
        className="relative flex flex-1 flex-col items-start overflow-x-auto bg-muted p-4 sm:items-center sm:p-6 print:block print:overflow-visible print:bg-transparent print:p-0"
        data-print-id={print.id}
      >
        <ReceiptSheet receipt={receipt} schoolName={school.name} language={locale} printNo={print.printNo} />
      </main>
    </>
  );
}
