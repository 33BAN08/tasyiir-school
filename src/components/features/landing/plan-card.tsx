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
        "relative flex flex-col gap-5 rounded-xl border bg-lp-surface p-6",
        // A ring (not a 2 px border) keeps the contents, and so the trial buttons, level with the other cards.
        recommended ? "border-lp-brand ring-1 ring-lp-brand" : "border-lp-line",
      )}
    >
      {recommended && (
        <p className="absolute -top-3 start-6 rounded-full bg-lp-brand px-3 py-0.5 text-xs font-bold text-lp-on-brand">
          {t("recommended")}
        </p>
      )}
      <div>
        <h3 id={`plan-${plan}`} className="text-2xl font-extrabold">
          {t(`plans.${plan}.name`)}
        </h3>
        <p className="font-semibold text-lp-muted">{t(`plans.${plan}.for`)}</p>
        {plan === "large" && (
          <p data-plan-quote className="text-sm text-lp-muted">
            {t("plans.large.quote")}
          </p>
        )}
      </div>

      <div>
        <p>
          <span dir="ltr" className="text-4xl font-extrabold text-lp-brand">
            {formatPriceDh(monthly)}
          </span>
          <span className="ms-1 text-lp-muted">{t("perMonth")}</span>
        </p>
        <p className="mt-1 text-sm">
          {t("yearly", { price: ltr(formatPriceDh(yearly)), saving: ltr(formatPriceDh(yearlySaving(plan))) })}
        </p>
      </div>

      <ul className="flex flex-1 flex-col gap-2 border-t border-lp-line pt-4 text-sm">
        <Line>{t(`plans.${plan}.admins`)}</Line>
        {alerts ? <Line>{t("alerts.yes")}</Line> : <Line no>{t("alerts.no")}</Line>}
        <Line>{t(`plans.${plan}.support`)}</Line>
      </ul>

      <div className="flex flex-col gap-2">
        <a href="#demo" className={recommended ? BUTTON.primary : BUTTON.outline}>
          {t("ctaTrial")}
        </a>
        <a href="#demo" className={cn(BUTTON.link, "self-center py-2")}>
          {t("ctaDemo")}
        </a>
      </div>
    </div>
  );
}

function Line({ children, no = false }: { children: ReactNode; no?: boolean }) {
  const Icon = no ? Minus : Check;
  return (
    <li className={cn("flex items-start gap-2", no && "text-lp-muted")}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", no ? "text-lp-muted" : "text-lp-brand")} aria-hidden />
      {children}
    </li>
  );
}
