import { Check, Minus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { formatPriceDh, ltr } from "@/lib/format";
import { cn } from "@/lib/utils";

import { PLAN_OFFER, RECOMMENDED_PLAN, yearlySaving, type PlanKey } from "./content";
import { BUTTON } from "./landing-ui";

/** One plan: who it is for, the price (+ the yearly line), the three things that differ, the calls to action. */
export function PlanCard({ plan }: { plan: PlanKey }) {
  const t = useTranslations("landing.pricing");
  const { monthly, yearly, alerts } = PLAN_OFFER[plan];
  const recommended = plan === RECOMMENDED_PLAN;

  return (
    <div
      aria-labelledby={`plan-${plan}`}
      role="group"
      className={cn(
        // Same border width on every card: the contents, and so the trial buttons, stay level.
        "relative flex flex-col gap-5 rounded-[1.4rem] border p-6",
        recommended ? "border-lp-band bg-lp-band text-lp-on-brand shadow-xl" : "border-lp-line bg-lp-surface",
      )}
    >
      {recommended && (
        <p className="absolute -top-3 start-6 rounded-full bg-lp-sand px-3 py-0.5 text-xs font-extrabold text-lp-ink">
          {t("recommended")}
        </p>
      )}
      <div>
        <h3 id={`plan-${plan}`} className="text-2xl font-extrabold">
          {t(`plans.${plan}.name`)}
        </h3>
        <p className={cn("font-semibold", recommended ? "text-lp-band-muted" : "text-lp-muted")}>{t(`plans.${plan}.for`)}</p>
        {plan === "large" && (
          <p data-plan-quote className="text-sm text-lp-muted">
            {t("plans.large.quote")}
          </p>
        )}
      </div>

      <div>
        <p>
          <span dir="ltr" className={cn("text-4xl font-extrabold", recommended ? "text-lp-on-brand" : "text-lp-brand")}>
            {formatPriceDh(monthly)}
          </span>
          <span className={cn("ms-1", recommended ? "text-lp-band-muted" : "text-lp-muted")}>{t("perMonth")}</span>
        </p>
        <p className="mt-1 text-sm">
          {t("yearly", { price: ltr(formatPriceDh(yearly)), saving: ltr(formatPriceDh(yearlySaving(plan))) })}
        </p>
      </div>

      <ul className={cn("flex flex-1 flex-col gap-2 border-t pt-4 text-sm", recommended ? "border-lp-band-line" : "border-lp-line")}>
        <Line dark={recommended}>{t(`plans.${plan}.admins`)}</Line>
        {alerts ? <Line dark={recommended}>{t("alerts.yes")}</Line> : <Line dark={recommended} no>{t("alerts.no")}</Line>}
        <Line dark={recommended}>{t(`plans.${plan}.support`)}</Line>
      </ul>

      <div className="flex flex-col gap-2">
        <a href="#trial" className={cn(recommended ? BUTTON.light : BUTTON.outline, "rounded-full")}>
          {t("ctaTrial")}
        </a>
        <a
          href="#demo"
          className={cn(
            recommended
              ? "rounded-sm font-semibold text-lp-on-brand underline-offset-4 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lp-on-brand"
              : BUTTON.link,
            "self-center py-2",
          )}
        >
          {t("ctaDemo")}
        </a>
      </div>
    </div>
  );
}

/** `dark` = inside the highlighted (green) card. */
function Line({ children, no = false, dark = false }: { children: ReactNode; no?: boolean; dark?: boolean }) {
  const Icon = no ? Minus : Check;
  const muted = dark ? "text-lp-band-muted" : "text-lp-muted";
  return (
    <li className={cn("flex items-start gap-2", no && muted)}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", no ? muted : dark ? "text-lp-band-accent" : "text-lp-brand")} aria-hidden />
      {children}
    </li>
  );
}
