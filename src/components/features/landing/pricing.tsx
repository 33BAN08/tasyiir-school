import { useTranslations } from "next-intl";

import { CompareTable } from "./compare-table";
import { PLANS } from "./content";
import { FoundingBanner } from "./founding-banner";
import { Section } from "./landing-ui";
import { PlanCard } from "./plan-card";

/** Founding offer, the three plans by school size, then the comparison table. */
export function Pricing() {
  const t = useTranslations("landing.pricing");

  return (
    <Section id="plans" tone="tint" title={t("title")} subtitle={t("subtitle")}>
      <FoundingBanner />
      <div className="grid gap-6 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <PlanCard key={plan} plan={plan} />
        ))}
      </div>
      <CompareTable />
    </Section>
  );
}
