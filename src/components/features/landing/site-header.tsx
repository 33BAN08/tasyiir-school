import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

import { SECTION_LINKS } from "./content";
import { LanguageLinks } from "./language-links";
import { BUTTON, Logo, WRAP } from "./landing-ui";
import { MobileMenu } from "./mobile-menu";

/** `page` = the public page shown (its path), so section links and the language switch work off the home page too. */
export function SiteHeader({ page = "/" }: { page?: string }) {
  const t = useTranslations("landing.nav");
  const locale = useLocale();
  const base = page === "/" ? "" : `/${locale}`;
  const links = SECTION_LINKS.map(({ id, key }) => ({ href: `${base}#${id}`, label: t(key) }));

  return (
    <header className="sticky top-0 z-40 border-b border-lp-line bg-lp-bg">
      <div className={cn(WRAP, "flex h-16 items-center gap-4")}>
        <Link
          href="/"
          aria-label={t("home")}
          className="rounded-lg text-lp-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lp-brand"
        >
          <Logo />
        </Link>

        <nav aria-label={t("label")} className="ms-4 hidden lg:block">
          <ul className="flex items-center gap-1">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-lp-ink outline-none hover:bg-lp-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lp-brand"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ms-auto hidden items-center gap-2 lg:flex">
          <LanguageLinks href={page} />
          <Link href="/login" className={cn(BUTTON.link, "flex min-h-11 items-center px-3")}>
            {t("login")}
          </Link>
          <a href={`${base}#demo`} className={BUTTON.primary}>
            {t("demo")}
          </a>
        </div>

        <MobileMenu
          className="ms-auto lg:hidden"
          links={links}
          demoHref={`${base}#demo`}
          labels={{ menu: t("menu"), close: t("closeMenu"), nav: t("label"), login: t("login"), demo: t("demo") }}
        >
          <LanguageLinks href={page} />
        </MobileMenu>
      </div>
    </header>
  );
}
