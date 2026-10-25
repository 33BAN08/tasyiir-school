import { useTranslations } from "next-intl";
import { Suspense } from "react";

import { LanguageLinks } from "@/components/features/i18n/language-links";
import { ThemeToggle } from "@/components/features/theme/theme-toggle";
import { BRAND, BRAND_ASSETS } from "@/lib/brand";

/**
 * Sign-in, password change, suspended / deactivated pages (Madar app refresh,
 * 2026-10-25): the white logo and the tagline on the green zellige band, the
 * page's card on top, the language links and the theme switch at the bottom.
 */
export default function AuthLayout({ children }: LayoutProps<"/[locale]">) {
  const t = useTranslations("auth");

  return (
    <main className="app-zellige flex flex-1 flex-col items-center justify-center gap-6 p-4 sm:p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG (white lettering for the green band) */}
          <img src={BRAND_ASSETS.logoDark} alt={BRAND.product} width={630} height={365} className="h-24 w-auto" />
          <p className="font-bold text-mint">{t("tagline")}</p>
        </div>
        {children}
      </div>
      <footer className="on-brand flex flex-wrap items-center justify-center gap-2 [&_[data-slot=button]]:size-11 [&_[data-slot=dropdown-menu-trigger]]:size-11">
        {/* usePathname() is request-time data: own Suspense boundary. */}
        <Suspense fallback={null}>
          <LanguageLinks label={t("languages")} />
        </Suspense>
        <ThemeToggle />
      </footer>
    </main>
  );
}
