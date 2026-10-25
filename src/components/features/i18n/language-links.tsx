"use client";

import { useLocale } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { LOCALE_NAMES, routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * The current page in each language, as plain links (sign-in pages, on the
 * green band: white text). Each name is written in its own language.
 */
export function LanguageLinks({ label }: { label: string }) {
  const current = useLocale();
  const pathname = usePathname();

  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap items-center justify-center gap-1">
        {routing.locales.map((locale) => (
          <li key={locale}>
            <Link
              href={pathname}
              locale={locale}
              lang={locale}
              hrefLang={locale}
              aria-current={locale === current ? "true" : undefined}
              className={cn(
                "flex min-h-11 items-center rounded-lg px-3 text-sm font-bold outline-none focus-visible:ring-3 focus-visible:ring-mint",
                locale === current ? "bg-brand-foreground/15 text-brand-foreground" : "text-mint hover:bg-brand-foreground/10 hover:text-brand-foreground",
              )}
            >
              {LOCALE_NAMES[locale]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
