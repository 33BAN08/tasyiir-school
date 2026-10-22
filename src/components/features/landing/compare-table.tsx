import { Check, Minus } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { COMPARE_ALL_PLANS, COMPARE_DIFFERENCES, PLANS, RECOMMENDED_PLAN } from "./content";

/**
 * Every working feature as a row, the three plans as columns: what differs
 * first, then what every plan has. On a phone each feature name sits on its own
 * line above its three values, so the three plans always fit side by side.
 */
export function CompareTable() {
  const t = useTranslations("landing.pricing");
  const groups = [
    { key: "differences", rows: COMPARE_DIFFERENCES },
    { key: "allPlans", rows: COMPARE_ALL_PLANS },
  ] as const;

  return (
    <>
      <h3 className="mt-16 mb-4 text-center text-2xl font-extrabold">{t("compare.title")}</h3>
      <div className="overflow-x-auto rounded-xl border border-lp-line bg-lp-surface">
        <table className="w-full text-sm">
          <caption className="sr-only">{t("compare.title")}</caption>
          <thead>
            <tr className="border-b border-lp-line">
              <th scope="col" className="p-3 text-start font-bold max-sm:sr-only">
                {t("compare.feature")}
              </th>
              {PLANS.map((plan) => (
                <th
                  key={plan}
                  scope="col"
                  className={cn(
                    "w-1/3 px-1 py-3 text-center text-xs font-bold sm:w-36 sm:p-3 sm:text-sm",
                    plan === RECOMMENDED_PLAN && "text-lp-brand",
                  )}
                >
                  {t(`plans.${plan}.name`)}
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.key} data-compare={group.key}>
              <tr className="border-b border-lp-line bg-lp-tint">
                <th scope="colgroup" colSpan={4} className="px-3 py-2 text-start text-xs font-bold text-lp-brand">
                  {t(`compare.groups.${group.key}`)}
                </th>
              </tr>
              {group.rows.flatMap((row) => [
                <tr key={`${row.key}-label`} aria-hidden className="sm:hidden">
                  <td colSpan={3} className="px-3 pt-3 text-start font-semibold">
                    {t(`compare.rows.${row.key}`)}
                  </td>
                </tr>,
                <tr key={row.key} className="border-b border-lp-line last:border-0">
                  <th scope="row" className="p-3 text-start font-semibold max-sm:sr-only">
                    {t(`compare.rows.${row.key}`)}
                  </th>
                  {PLANS.map((plan) => (
                    <td key={plan} className="px-1 pt-1 pb-3 text-center text-xs sm:p-3 sm:text-sm">
                      {"text" in row ? (
                        t(`compare.values.${row.key}.${plan}`)
                      ) : (
                        <Included yes={row.included[plan]} yesLabel={t("compare.included")} noLabel={t("compare.notIncluded")} />
                      )}
                    </td>
                  ))}
                </tr>,
              ])}
            </tbody>
          ))}
        </table>
      </div>
    </>
  );
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
