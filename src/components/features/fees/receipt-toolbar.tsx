"use client";

import { ArrowLeft, Languages, Printer } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

type Props = {
  backHref: string;
  /** Defaults to "back to the student" (staff). */
  backLabel?: string;
  /** The same receipt in the other language, carrying this print (re-used, nothing recorded). */
  switchHref: string;
  switchLocale: "fr" | "ar";
};

/** Above the receipt on screen, never printed: back, print / save as PDF, FR ⇄ AR. */
export function ReceiptToolbar({ backHref, backLabel, switchHref, switchLocale }: Props) {
  const t = useTranslations("fees.receipt");
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur print:hidden">
      <Button asChild variant="ghost" className="min-h-11">
        <Link href={backHref}>
          <ArrowLeft className="rtl:-scale-x-100" aria-hidden />
          {backLabel ?? t("back")}
        </Link>
      </Button>
      <Button type="button" className="min-h-11" onClick={() => window.print()}>
        <Printer aria-hidden />
        {t("print")}
      </Button>
      <Button asChild variant="outline" className="min-h-11">
        <Link href={switchHref} locale={switchLocale} prefetch={false} data-receipt-switch={switchLocale} replace>
          <Languages aria-hidden />
          {t("switchLanguage")}
        </Link>
      </Button>
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
    </div>
  );
}
