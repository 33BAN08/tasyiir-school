import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { LOCALE_NAMES, routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/** Visible short names; the full name goes in the aria-label. */
const SHORT = { ar: "عربي", fr: "FR", en: "EN" } as const;

/** Language switch of the public pages: three plain links to `href` in each language (works without JavaScript). */
/** `onDark` = on the green zellige header of the home page. */
export function LanguageLinks({ className, href = "/", onDark = false }: { className?: string; href?: string; onDark?: boolean }) {
  const t = useTranslations("landing.language");
  const current = useLocale();

  return (
    <nav aria-label={t("label")} className={className}>
      <ul className="flex items-center gap-1">
        {routing.locales.map((locale) => (
          <li key={locale}>
            <Link
              href={href}
              locale={locale}
              lang={locale}
              hrefLang={locale}
              aria-label={t("switchTo", { language: LOCALE_NAMES[locale] })}
              aria-current={locale === current ? "true" : undefined}
              className={cn(
                "flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-sm font-bold outline-none focus-visible:outline-2 focus-visible:outline-offset-2",
                onDark
                  ? cn(
                      "focus-visible:outline-lp-on-brand",
                      locale === current ? "bg-lp-band-2 text-lp-on-brand" : "text-lp-band-muted hover:bg-lp-band-2 hover:text-lp-on-brand",
                    )
                  : cn(
                      "focus-visible:outline-lp-brand",
                      locale === current ? "bg-lp-tint text-lp-brand" : "text-lp-muted hover:bg-lp-tint hover:text-lp-ink",
                    ),
              )}
            >
              {SHORT[locale]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
