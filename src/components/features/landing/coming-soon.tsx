import { useTranslations } from "next-intl";

import { COMING_SOON } from "./content";
import { IconBadge, Section, SoonBadge } from "./landing-ui";

/** Modules not built yet: kept out of the plans, listed here on their own. */
export function ComingSoon() {
  const t = useTranslations("landing");

  return (
    <Section id="soon" title={t("soon.title")} subtitle={t("soon.keepPrice")}>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {COMING_SOON.map(({ key, icon: Icon }) => (
          <li key={key} data-soon-item={key} className="flex items-start gap-3 rounded-xl border border-dashed border-lp-line bg-lp-surface p-5">
            <IconBadge className="size-10">
              <Icon className="size-5" aria-hidden />
            </IconBadge>
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="flex flex-wrap items-center gap-2 font-bold">
                {t(`features.items.${key}.title`)}
                <SoonBadge label={t("soon.badge")} />
              </h3>
              <p className="text-sm text-lp-muted">{t(`features.items.${key}.body`)}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
