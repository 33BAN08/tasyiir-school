"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { WIZARD_STEPS } from "@/lib/validations/platform";

/** Numbered steps; done steps get a check, the current one is announced to screen readers. */
export function WizardStepper({ current }: { current: number }) {
  const t = useTranslations("platform.wizard");

  return (
    <ol className="flex flex-wrap gap-x-6 gap-y-2" aria-label={t("stepsLabel")}>
      {WIZARD_STEPS.map((s, i) => (
        <li
          key={s.key}
          aria-current={i === current ? "step" : undefined}
          className={cn(
            "flex items-center gap-2 text-sm",
            i === current ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "flex size-6 items-center justify-center rounded-full border font-numeric text-xs",
              i < current && "border-primary bg-primary text-primary-foreground",
              i === current && "border-primary text-primary",
            )}
          >
            {i < current ? <Check className="size-3.5" aria-hidden /> : i + 1}
          </span>
          {t(`steps.${s.key}`)}
        </li>
      ))}
    </ol>
  );
}
