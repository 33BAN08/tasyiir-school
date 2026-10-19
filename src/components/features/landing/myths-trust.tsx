import { CircleCheck, Languages, MapPin, MessageCircleQuestion, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { IconBadge, Section } from "./landing-ui";

/** Mythe / Réalité: the two objections schools raise most. */
export function Myths() {
  const t = useTranslations("landing.myths");

  return (
    <Section id="myths" tone="tint" title={t("title")}>
      <div className="grid gap-6 md:grid-cols-2">
        {(["teachers", "parents"] as const).map((key) => (
          <div key={key} className="flex flex-col overflow-hidden rounded-xl border border-lp-line bg-lp-surface">
            <div className="flex items-start gap-3 p-6">
              <MessageCircleQuestion className="mt-0.5 size-6 shrink-0 text-lp-muted" aria-hidden />
              <p>
                <span className="block text-sm font-bold text-lp-muted">{t("myth")}</span>
                <span className="text-lg italic rtl:not-italic">{t(`${key}.myth`)}</span>
              </p>
            </div>
            <div className="flex flex-1 items-start gap-3 border-t border-lp-line bg-lp-bg p-6">
              <CircleCheck className="mt-0.5 size-6 shrink-0 text-lp-brand" aria-hidden />
              <p>
                <span className="block text-sm font-bold text-lp-brand">{t("reality")}</span>
                <span className="text-lg font-semibold">{t(`${key}.reality`)}</span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

const TRUST = [
  { key: "morocco", icon: MapPin },
  { key: "languages", icon: Languages },
  { key: "separated", icon: ShieldCheck },
  // "Sauvegardes" comes back when production moves to Supabase Pro (daily backups);
  // the free plan has none (user, 2026-10-19).
] as const;

/** Facts about the product, no testimonials. */
export function Trust() {
  const t = useTranslations("landing.trust");

  return (
    <Section id="trust" title={t("title")}>
      <ul className="grid gap-6 md:grid-cols-3">
        {TRUST.map(({ key, icon: Icon }) => (
          <li key={key} className="flex flex-col gap-3 rounded-xl border border-lp-line bg-lp-surface p-6">
            <IconBadge>
              <Icon className="size-5" aria-hidden />
            </IconBadge>
            <h3 className="text-lg font-bold">{t(`${key}.title`)}</h3>
            <p className="text-sm text-lp-muted">{t(`${key}.body`)}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
