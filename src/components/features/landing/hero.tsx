import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { HeroPhone } from "./hero-phone";
import { BUTTON, WRAP } from "./landing-ui";

const POINTS = ["noStore", "languages", "noSetupFee"] as const;

/**
 * The hero "board": a dark green panel in a sand frame, on the zellige band
 * that starts with the header. Text first, then the phone (stacked on phones).
 */
export function Hero() {
  const t = useTranslations("landing.home.hero");

  return (
    <section aria-labelledby="hero-title" className="lp-zellige pb-16 pt-3 text-lp-on-brand sm:pb-20">
      <div className={WRAP}>
        <div className="rounded-[1.75rem] bg-lp-sand p-2.5 shadow-2xl sm:p-3.5">
          <div className="grid items-center gap-10 rounded-[1.15rem] bg-lp-board px-5 py-10 sm:px-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-12 lg:px-12">
            <div className="flex min-w-0 flex-col items-start gap-5">
              <p className="inline-flex items-center gap-2 rounded-full bg-lp-band-2 px-3.5 py-1.5 text-sm font-bold">
                <span aria-hidden className="size-2 rounded-full bg-lp-sand" />
                {t("tag")}
              </p>
              <h1 id="hero-title" className="text-[2rem] leading-tight font-extrabold text-balance sm:text-5xl lg:text-[3.25rem]">
                {t("titleA")}
                <br />
                {t("titleB")}
              </h1>
              <p className="max-w-xl text-lg text-lp-band-muted sm:text-xl">{t("subtitle")}</p>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <a href="#demo" className={cn(BUTTON.light, "rounded-full px-6")}>
                  {t("ctaDemo")}
                </a>
                <a href="#how" className={cn(BUTTON.outlineOnDark, "rounded-full px-6")}>
                  {t("ctaHow")}
                </a>
              </div>
              <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-lp-band-muted sm:text-base">
                {POINTS.map((point) => (
                  <li key={point} className="flex items-center gap-2">
                    <span aria-hidden className="size-1.5 rounded-full bg-lp-sand" />
                    {t(`points.${point}`)}
                  </li>
                ))}
              </ul>
            </div>
            <HeroPhone />
          </div>
        </div>
      </div>
    </section>
  );
}
