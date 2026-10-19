import { Check, Minus } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { PLAN_FEATURES, PLANS, planOf, type PlanKey } from "./content";
import { BUTTON, Section, SoonBadge } from "./landing-ui";

const ALL_FEATURES = PLANS.flatMap((plan) => PLAN_FEATURES[plan]);

/** Three plans, "Prix sur demande", then the comparison table. */
export function Pricing() {
  const t = useTranslations("landing.pricing");
  const tf = useTranslations("landing.features.items");

  return (
    <Section id="plans" tone="tint" title={t("title")} subtitle={t("subtitle")}>
      <div className="grid gap-6 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const recommended = plan === "pro";
          return (
            <div
              key={plan}
              aria-labelledby={`plan-${plan}`}
              role="group"
              className={cn(
                "relative flex flex-col gap-4 rounded-xl border bg-lp-surface p-6",
                recommended ? "border-2 border-lp-brand" : "border-lp-line",
              )}
            >
              {recommended && (
                <p className="absolute -top-3 start-6 rounded-full bg-lp-brand px-3 py-0.5 text-xs font-bold text-lp-on-brand">
                  {t("recommended")}
                </p>
              )}
              <h3 id={`plan-${plan}`} className="text-2xl font-extrabold">
                {t(`plans.${plan}.name`)}
              </h3>
              <p className="text-lp-muted">{t(`plans.${plan}.lead`)}</p>
              <p className="text-xl font-extrabold text-lp-brand">{t("onRequest")}</p>
              <ul className="flex flex-1 flex-col gap-2 text-sm">
                {PLAN_FEATURES[plan].map(({ key, soon }) => (
                  <li key={key} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-lp-brand" aria-hidden />
                    <span className="flex flex-wrap items-center gap-2">
                      {tf(`${key}.title`)}
                      {soon && <SoonBadge label={t("compare.soon")} />}
                    </span>
                  </li>
                ))}
              </ul>
              <a href="#demo" className={recommended ? BUTTON.primary : BUTTON.outline}>
                {t("cta")}
              </a>
            </div>
          );
        })}
      </div>

      <h3 className="mt-16 mb-4 text-center text-2xl font-extrabold">{t("compare.title")}</h3>
      {/* Only the table scrolls sideways on a narrow phone, never the page. */}
      <div className="overflow-x-auto rounded-xl border border-lp-line bg-lp-surface">
        <table className="w-full text-sm">
          <caption className="sr-only">{t("compare.title")}</caption>
          <thead>
            <tr className="border-b border-lp-line">
              <th scope="col" className="p-3 text-start font-bold">
                {t("compare.feature")}
              </th>
              {PLANS.map((plan) => (
                <th key={plan} scope="col" className="w-[4.5rem] px-1 py-3 text-center text-xs font-bold sm:w-32 sm:p-3 sm:text-sm">
                  {t(`plans.${plan}.name`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_FEATURES.map(({ key, soon }) => (
              <tr key={key} className="border-b border-lp-line last:border-0 even:bg-lp-bg">
                <th scope="row" className="p-3 text-start font-semibold">
                  <span className="flex flex-wrap items-center gap-2">
                    {tf(`${key}.title`)}
                    {soon && <SoonBadge label={t("compare.soon")} />}
                  </span>
                </th>
                {PLANS.map((plan) => (
                  <td key={plan} className="px-1 py-3 text-center sm:p-3">
                    <Included yes={includes(plan, planOf(key))} yesLabel={t("compare.included")} noLabel={t("compare.notIncluded")} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function includes(plan: PlanKey, firstPlan: PlanKey) {
  return PLANS.indexOf(plan) >= PLANS.indexOf(firstPlan);
}

function Included({ yes, yesLabel, noLabel }: { yes: boolean; yesLabel: string; noLabel: string }) {
  return yes ? (
    <span className="inline-flex text-lp-brand">
      <Check className="size-5" aria-hidden />
      <span className="sr-only">{yesLabel}</span>
    </span>
  ) : (
    <span className="inline-flex text-lp-muted">
      <Minus className="size-5" aria-hidden />
      <span className="sr-only">{noLabel}</span>
    </span>
  );
}
