import { MessageCircle, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { whatsappUrl } from "@/lib/landing/whatsapp";
import { cn } from "@/lib/utils";

import { BUTTON } from "./landing-ui";

/**
 * Founding-school offer. Opens WhatsApp with a message in the page's language;
 * without a WhatsApp number it leads to the demo form instead.
 */
export function FoundingBanner() {
  const t = useTranslations("landing.pricing.founding");
  const whatsapp = whatsappUrl(t("whatsappMessage"));
  const external = whatsapp ? { target: "_blank", rel: "noopener noreferrer" } : {};

  return (
    <a
      href={whatsapp ?? "#demo"}
      {...external}
      data-founding-banner
      className="mx-auto mb-8 flex max-w-3xl flex-col gap-3 rounded-xl border border-lp-brand bg-lp-surface p-4 outline-none hover:bg-lp-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lp-brand sm:flex-row sm:items-center"
    >
      <span className="flex flex-1 items-start gap-3">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-lp-brand" aria-hidden />
        <span className="text-sm sm:text-base">
          <strong className="font-extrabold text-lp-brand">{t("label")}</strong> {t("text")}
        </span>
      </span>
      {/* Looks like a button (the banner itself is the link): full width on phones. */}
      <span className={cn(whatsapp ? BUTTON.whatsapp : BUTTON.primary, "w-full shrink-0 sm:w-auto")}>
        {whatsapp && <MessageCircle className="size-5" aria-hidden />}
        {whatsapp ? t("ctaWhatsapp") : t("ctaDemo")}
      </span>
    </a>
  );
}
