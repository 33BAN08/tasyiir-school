import { CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";

import { TimetableVisual } from "./dive-visuals";
import { Section } from "./landing-ui";

// Roll call, justifications and totals are shown on the phones of the features section.
const DIVES: { key: "timetable"; Visual: ComponentType }[] = [{ key: "timetable", Visual: TimetableVisual }];

export function DeepDives() {
  const t = useTranslations("landing.dives");

  return (
    <Section id="details" title={t("title")}>
      <div className="flex flex-col gap-16">
        {DIVES.map(({ key, Visual }, index) => (
          <article
            key={key}
            aria-labelledby={`dive-${key}`}
            className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16"
          >
            <div className={cn("flex flex-col gap-4", index % 2 === 1 && "lg:order-2")}>
              <p className="text-sm font-bold text-lp-brand">{t(`${key}.kicker`)}</p>
              <h3 id={`dive-${key}`} className="text-2xl font-extrabold sm:text-3xl">
                {t(`${key}.title`)}
              </h3>
              <p className="text-lg text-lp-muted">{t(`${key}.body`)}</p>
              <ul className="flex flex-col gap-2">
                {(["a", "b", "c"] as const).map((point) => (
                  <li key={point} className="flex items-start gap-2">
                    <CircleCheck className="mt-1 size-5 shrink-0 text-lp-brand" aria-hidden />
                    <span>{t(`${key}.points.${point}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="w-full">
              <Visual />
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}
