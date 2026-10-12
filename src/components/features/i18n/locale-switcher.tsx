"use client";

import { Check, Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePathname, useRouter } from "@/i18n/navigation";
import { getDirection, LOCALE_NAMES, routing, type Locale } from "@/i18n/routing";
import { saveLocalePreference } from "@/lib/i18n/actions";

type Props = {
  /** Also save the choice on the user's profile (only when signed in). */
  persist?: boolean;
};

export function LocaleSwitcher({ persist = false }: Props) {
  const t = useTranslations("localeSwitcher");
  const current = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function switchTo(locale: Locale) {
    if (locale === current) return;
    startTransition(async () => {
      if (persist) await saveLocalePreference(locale);
      // Keep the query string (e.g. ?next=) when changing language.
      router.replace(`${pathname}${window.location.search}`, { locale });
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={isPending} aria-label={t("label")}>
          <Languages aria-hidden />
          {LOCALE_NAMES[current]}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {routing.locales.map((locale) => (
          <DropdownMenuItem
            key={locale}
            lang={locale}
            dir={getDirection(locale)}
            onSelect={() => switchTo(locale)}
          >
            <Check className={locale === current ? "opacity-100" : "opacity-0"} aria-hidden />
            {LOCALE_NAMES[locale]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
