import { useTranslations } from "next-intl";
import type { ComponentType } from "react";

import { Section } from "./landing-ui";
import { PhoneFrame } from "./phone-frame";
import { JustifyScreen, ParentAlertScreen } from "./showcase-parent";
import { RollCallScreen, TotalsScreen } from "./showcase-staff";

const SCREENS: { key: "rollCall" | "alert" | "justify" | "totals"; Screen: ComponentType }[] = [
  { key: "rollCall", Screen: RollCallScreen },
  { key: "alert", Screen: ParentAlertScreen },
  { key: "justify", Screen: JustifyScreen },
  { key: "totals", Screen: TotalsScreen },
];

/**
 * The product on four phones (drawn copies of the real screens, fictional
 * names). Phones: the row scrolls sideways on its own, never the page.
 */
export function Features() {
  const t = useTranslations("landing.showcase");

  return (
    <Section id="features" tone="tint" title={t("title")} subtitle={t("subtitle")}>
      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 xl:mx-0 xl:px-0">
        <ul className="flex snap-x snap-mandatory gap-6 xl:justify-between">
          {SCREENS.map(({ key, Screen }) => (
            <li key={key} className="flex" data-showcase={key}>
              <PhoneFrame
                caption={
                  <>
                    <strong className="block text-base font-bold text-lp-ink">{t(`items.${key}.title`)}</strong>
                    {t(`items.${key}.line`)}
                  </>
                }
              >
                <Screen />
              </PhoneFrame>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
