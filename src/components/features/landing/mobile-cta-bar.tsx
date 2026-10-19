import { CalendarCheck, MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import { whatsappUrl } from "@/lib/landing/whatsapp";
import { cn } from "@/lib/utils";

import { BUTTON } from "./landing-ui";

/** Phones only: a small bar fixed at the bottom, "Démo" + WhatsApp. */
export function MobileCtaBar() {
  const t = useTranslations("landing");
  const whatsapp = whatsappUrl(t("demo.whatsappMessage"));

  return (
    <nav
      aria-label={t("mobileBar.label")}
      className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-lp-line bg-lp-bg px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
    >
      <a href="#demo" className={cn(BUTTON.primary, "flex-1")}>
        <CalendarCheck className="size-5" aria-hidden />
        {t("mobileBar.demo")}
      </a>
      {whatsapp && (
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={cn(BUTTON.whatsapp, "flex-1")}>
          <MessageCircle className="size-5" aria-hidden />
          {t("mobileBar.whatsapp")}
        </a>
      )}
    </nav>
  );
}
