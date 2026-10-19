import { useTranslations } from "next-intl";

import { latinThenArabic } from "@/lib/fonts";
import { cn } from "@/lib/utils";

import { DeepDives } from "./deep-dives";
import { DemoSection } from "./demo-section";
import { Faq } from "./faq";
import { Features } from "./features";
import { Hero } from "./hero";
import { HowItWorks } from "./how-it-works";
import { MobileCtaBar } from "./mobile-cta-bar";
import { Myths, Trust } from "./myths-trust";
import { Pricing } from "./pricing";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

/** The public home page (/[locale]): always light, its own palette (.landing in globals.css). */
export function LandingPage() {
  const t = useTranslations("landing");

  return (
    <div
      className={cn("landing relative flex flex-1 flex-col bg-lp-bg text-lp-ink rtl:leading-[1.7]")}
      style={{ fontFamily: latinThenArabic() }}
    >
      <a
        href="#main"
        className="sr-only z-50 min-h-11 items-center rounded-lg bg-lp-brand px-4 font-bold text-lp-on-brand focus:not-sr-only focus:fixed focus:flex focus:start-4 focus:top-4"
      >
        {t("skip")}
      </a>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <Hero />
        <HowItWorks />
        <Features />
        <DeepDives />
        <Myths />
        <Trust />
        <Pricing />
        <Faq />
        <DemoSection />
      </main>
      <SiteFooter />
      <MobileCtaBar />
    </div>
  );
}
