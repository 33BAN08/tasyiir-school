import { CircleCheck, MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import { whatsappUrl } from "@/lib/landing/whatsapp";
import { cn } from "@/lib/utils";

import { DemoForm } from "./demo-form";
import { BUTTON, WRAP } from "./landing-ui";

/**
 * The closing band on the zellige: the founding-school offer (same texts and
 * WhatsApp message as the banner above the plans), then why ask for a demo
 * and the form on a white card.
 */
export function DemoSection() {
  const t = useTranslations("landing.demo");
  const tFounding = useTranslations("landing.pricing.founding");
  const whatsapp = whatsappUrl(t("whatsappMessage"));
  const foundingWhatsapp = whatsappUrl(tFounding("whatsappMessage"));

  return (
    <section id="demo" aria-labelledby="demo-title" className="lp-zellige py-16 text-lp-on-brand sm:py-20">
      <div className={cn(WRAP, "flex flex-col gap-12")}>
        <div data-closing-cta className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
          <p className="text-2xl leading-snug font-extrabold text-balance sm:text-3xl">
            <span className="text-lp-band-accent">{tFounding("label")}</span> {tFounding("text")}
          </p>
          <div className="flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
            <a href="#demo-form" className={BUTTON.sand}>
              {t("cta")}
            </a>
            {foundingWhatsapp && (
              <a href={foundingWhatsapp} target="_blank" rel="noopener noreferrer" className={cn(BUTTON.outlineOnDark, "rounded-full")}>
                <MessageCircle className="size-5" aria-hidden />
                {tFounding("ctaWhatsapp")}
              </a>
            )}
          </div>
        </div>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-16">
          <div className="flex flex-col gap-5">
            <h2 id="demo-title" className="text-3xl font-extrabold sm:text-4xl">
              {t("title")}
            </h2>
            <p className="text-lg text-lp-band-muted">{t("subtitle")}</p>
            <ul className="flex flex-col gap-3">
              {(["a", "b", "c"] as const).map((point) => (
                <li key={point} className="flex items-start gap-2">
                  <CircleCheck className="mt-0.5 size-5 shrink-0 text-lp-band-accent" aria-hidden />
                  {t(`points.${point}`)}
                </li>
              ))}
            </ul>
            {whatsapp && (
              <div className="mt-2 flex flex-col items-start gap-3">
                <p className="font-bold">{t("orWhatsapp")}</p>
                <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={BUTTON.whatsapp}>
                  <MessageCircle className="size-5" aria-hidden />
                  {t("whatsapp")}
                </a>
              </div>
            )}
          </div>
          {/* id="trial": the plan cards' "Essai gratuit" buttons land here, the form then picks the trial. */}
          <div id="demo-form" className="scroll-mt-20">
            <div id="trial" className="relative scroll-mt-20 rounded-2xl bg-lp-surface p-5 text-lp-ink shadow-xl sm:p-8">
              <DemoForm />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
