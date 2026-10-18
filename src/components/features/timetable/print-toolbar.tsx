"use client";

import { ArrowLeft, Printer } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

type Props = { backHref: string; sheets: number };

/** Above the sheets on screen, never printed: back, print / save as PDF, how. */
export function PrintToolbar({ backHref, sheets }: Props) {
  const t = useTranslations("timetable.print");
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur print:hidden">
      <Button asChild variant="ghost" size="sm">
        <Link href={backHref}>
          <ArrowLeft className="rtl:-scale-x-100" aria-hidden />
          {t("back")}
        </Link>
      </Button>
      <Button type="button" onClick={() => window.print()} disabled={sheets === 0}>
        <Printer aria-hidden />
        {t("print")}
      </Button>
      <p className="text-sm text-muted-foreground">
        {t("pages", { count: sheets })} · {t("hint")}
      </p>
    </div>
  );
}
