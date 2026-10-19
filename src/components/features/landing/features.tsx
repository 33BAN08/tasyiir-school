import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { PLAN_FEATURES, PLANS } from "./content";
import { IconBadge, Section, SoonBadge } from "./landing-ui";

/** Features grouped by the plan that adds them; not-yet-built ones say "Bientôt". */
export function Features() {
  const t = useTranslations("landing.features");

  return (
    <Section id="features" tone="tint" title={t("title")} subtitle={t("subtitle")}>
      <div className="grid gap-6 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan}
            className={cn(
              "flex flex-col gap-4 rounded-xl border bg-lp-surface p-6",
              plan === "basic" ? "border-lp-brand" : "border-lp-line",
            )}
          >
            <h3 className="text-xl font-extrabold text-lp-brand">{t(`plans.${plan}`)}</h3>
            <ul className="flex flex-col gap-4">
              {PLAN_FEATURES[plan].map(({ key, icon: Icon, soon }) => (
                <li key={key} className="flex items-start gap-3">
                  <IconBadge className="size-10">
                    <Icon className="size-5" aria-hidden />
                  </IconBadge>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="flex flex-wrap items-center gap-2 font-bold">
                      {t(`items.${key}.title`)}
                      {soon && <SoonBadge label={t("soon")} />}
                    </p>
                    <p className="text-sm text-lp-muted">{t(`items.${key}.body`)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}
