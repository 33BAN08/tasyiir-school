import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

import { Section } from "./landing-ui";

const QUESTIONS = ["security", "arabic", "massar", "mobile", "trial"] as const;

/** Native <details>: keyboard and screen readers work without JavaScript. */
export function Faq() {
  const t = useTranslations("landing.faq");

  return (
    <Section id="faq" title={t("title")}>
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        {QUESTIONS.map((key) => (
          <details key={key} className="group rounded-xl border border-lp-line bg-lp-surface">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-5 py-3 text-lg font-bold outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lp-brand [&::-webkit-details-marker]:hidden">
              {t(`${key}.q`)}
              <ChevronDown className="size-5 shrink-0 text-lp-brand group-open:rotate-180" aria-hidden />
            </summary>
            <p className="px-5 pb-5 text-lp-muted">{t(`${key}.a`)}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
