import { CalendarDays, Camera, Clock, Languages, Megaphone, Smartphone, GraduationCap } from "lucide-react";
import { useTranslations } from "next-intl";

import { IconBadge, SoonBadge, WRAP } from "./landing-ui";

/** Working features only (each one is built and tested). */
const ITEMS = [
  { key: "timetable", icon: CalendarDays },
  { key: "justifications", icon: Camera },
  { key: "totals", icon: Clock },
  { key: "messages", icon: Megaphone },
  { key: "phoneApp", icon: Smartphone },
  { key: "languages", icon: Languages },
] as const;

/** What the school uses every day, then a dashed "Bientôt" card (grades: not finished yet). */
export function Features() {
  const t = useTranslations("landing.home.features");
  const tSoon = useTranslations("landing.soon");

  return (
    <section id="features" aria-labelledby="features-title" className="bg-lp-tint py-16 sm:py-24">
      <div className={WRAP}>
        <div className="mx-auto mb-10 flex max-w-2xl flex-col items-center gap-2 text-center">
          <p className="font-extrabold text-lp-brand">{t("eyebrow")}</p>
          <h2 id="features-title" className="text-3xl font-extrabold sm:text-4xl">
            {t("title")}
          </h2>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {ITEMS.map(({ key, icon: Icon }) => (
            <li key={key} data-feature={key} className="flex gap-4 rounded-[1.25rem] border border-lp-line bg-lp-surface p-6">
              <IconBadge>
                <Icon className="size-5" aria-hidden />
              </IconBadge>
              <div className="flex min-w-0 flex-col gap-1.5">
                <h3 className="text-lg font-extrabold">{t(`items.${key}.title`)}</h3>
                <p className="leading-relaxed text-lp-muted">{t(`items.${key}.body`)}</p>
              </div>
            </li>
          ))}
          {/* Not built yet: dashed, with the "Bientôt" badge, never a check mark. */}
          <li data-feature-soon className="flex gap-4 rounded-[1.25rem] border border-dashed border-lp-field bg-lp-surface p-6 sm:col-span-2 lg:col-span-3">
            <IconBadge>
              <GraduationCap className="size-5" aria-hidden />
            </IconBadge>
            <div className="flex min-w-0 flex-col gap-1.5">
              <h3 className="flex flex-wrap items-center gap-2 text-lg font-extrabold">
                {t("soon.title")}
                <SoonBadge label={tSoon("badge")} />
              </h3>
              <p className="leading-relaxed text-lp-muted">{t("soon.body")}</p>
            </div>
          </li>
        </ul>
      </div>
    </section>
  );
}
