import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { HeroDemo } from "./hero-demo";
import { BUTTON, WRAP } from "./landing-ui";

const CHIPS = ["phone", "parents", "conflicts", "languages"] as const;

export function Hero() {
  const t = useTranslations("landing.hero");

  return (
    <section aria-labelledby="hero-title" className="bg-lp-band text-lp-on-brand">
      <div className={cn(WRAP, "grid items-center gap-12 py-14 lg:grid-cols-[1fr_minmax(0,1.05fr)] lg:py-20")}>
        <div className="flex flex-col items-start gap-6">
          <p className="text-sm font-bold text-lp-band-accent">{t("eyebrow")}</p>
          <h1 id="hero-title" className="text-4xl leading-tight font-extrabold text-balance sm:text-5xl lg:text-[3.25rem]">
            {t("title")}
          </h1>
          <p className="max-w-xl text-lg text-lp-band-muted">{t("subtitle")}</p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <a href="#demo" className={BUTTON.light}>
              {t("ctaDemo")}
            </a>
            <a href="#how" className={BUTTON.outlineOnDark}>
              {t("ctaHow")}
            </a>
          </div>
          <ul className="flex flex-wrap gap-2">
            {CHIPS.map((chip) => (
              <li
                key={chip}
                className="inline-flex items-center gap-1.5 rounded-full border border-lp-band-line bg-lp-band-2 px-3 py-1.5 text-sm font-semibold"
              >
                <Check className="size-4 text-lp-band-accent" aria-hidden />
                {t(`chips.${chip}`)}
              </li>
            ))}
          </ul>
        </div>
        <HeroDemo />
      </div>
    </section>
  );
}
