import { BarChart3, BellRing, Camera, ShieldCheck, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";

import { IconBadge, Section } from "./landing-ui";

const STEPS = [
  { key: "teacher", icon: Smartphone },
  { key: "parent", icon: BellRing },
  { key: "photo", icon: Camera },
  { key: "review", icon: ShieldCheck },
  { key: "director", icon: BarChart3 },
] as const;

export function HowItWorks() {
  const t = useTranslations("landing.how");

  return (
    <Section id="how" title={t("title")} subtitle={t("subtitle")}>
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {STEPS.map(({ key, icon: Icon }, index) => (
          <li key={key} className="relative flex flex-col gap-3 rounded-xl border border-lp-line bg-lp-surface p-5">
            <div className="flex items-center justify-between gap-2">
              <IconBadge>
                <Icon className="size-5" aria-hidden />
              </IconBadge>
              <span aria-hidden className="text-3xl font-extrabold text-lp-deco tabular-nums">
                {index + 1}
              </span>
            </div>
            <h3 className="text-lg font-bold">{t(`steps.${key}.title`)}</h3>
            <p className="text-sm text-lp-muted">{t(`steps.${key}.body`)}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
