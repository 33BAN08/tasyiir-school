import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { WRAP } from "./landing-ui";

const STEPS = ["teacher", "family", "school"] as const;

/** Three steps, each on a lined notebook page. */
export function HowItWorks() {
  const t = useTranslations("landing.home.how");

  return (
    <section id="how" aria-labelledby="how-title" className="py-16 sm:py-24">
      <div className={WRAP}>
        <div className="mx-auto mb-10 flex max-w-2xl flex-col items-center gap-2 text-center">
          <p className="font-extrabold text-lp-brand">{t("eyebrow")}</p>
          <h2 id="how-title" className="text-3xl font-extrabold sm:text-4xl">
            {t("title")}
          </h2>
        </div>
        <ol className="grid gap-5 md:grid-cols-3 md:gap-6">
          {STEPS.map((key, index) => (
            <li
              key={key}
              data-how-step={key}
              className={cn("lp-notebook flex flex-col gap-3.5 rounded-[1.4rem] border border-lp-line bg-lp-surface p-6 sm:p-7")}
            >
              <span
                aria-hidden
                className="flex size-12 items-center justify-center rounded-2xl bg-lp-band font-numeric text-xl font-bold text-lp-on-brand"
              >
                {index + 1}
              </span>
              <h3 className="text-xl font-extrabold">{t(`steps.${key}.title`)}</h3>
              <p className="text-lg leading-8 text-lp-muted">{t(`steps.${key}.body`)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
