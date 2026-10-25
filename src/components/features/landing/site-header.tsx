import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

import { SECTION_LINKS } from "./content";
import { LanguageLinks } from "./language-links";
import { BUTTON, Logo, WRAP } from "./landing-ui";
import { MobileMenu } from "./mobile-menu";

/**
 * `page` = the public page shown (its path), so section links and the language switch work off the home page too.
 * `tone="green"` = the home page: the zellige band, the white logo, the sand call to action.
 */
export function SiteHeader({ page = "/", tone = "light" }: { page?: string; tone?: "light" | "green" }) {
  const t = useTranslations("landing.nav");
  const locale = useLocale();
  const base = page === "/" ? "" : `/${locale}`;
  const links = SECTION_LINKS.map(({ id, key }) => ({ href: `${base}#${id}`, label: t(key) }));
  const green = tone === "green";
  const focus = green ? "focus-visible:outline-lp-on-brand" : "focus-visible:outline-lp-brand";

  return (
    <header className={cn("sticky top-0 z-40", green ? "lp-zellige text-lp-on-brand" : "border-b border-lp-line bg-lp-bg")}>
      <div className={cn(WRAP, "flex h-16 items-center gap-4")}>
        <Link
          href="/"
          aria-label={t("home")}
          className={cn("rounded-lg outline-none focus-visible:outline-2 focus-visible:outline-offset-2", focus)}
        >
          <Logo onDark={green} />
        </Link>

        <nav aria-label={t("label")} className="ms-4 hidden lg:block">
          <ul className="flex items-center gap-1">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className={cn(
                    "flex min-h-11 items-center rounded-lg px-3 text-sm font-bold outline-none focus-visible:outline-2 focus-visible:outline-offset-2",
                    green ? "text-lp-on-brand hover:bg-lp-band-2" : "text-lp-ink hover:bg-lp-tint",
                    focus,
                  )}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ms-auto hidden items-center gap-2 lg:flex">
          <LanguageLinks href={page} onDark={green} />
          <Link
            href="/login"
            className={cn(
              green
                ? "flex min-h-11 items-center rounded-lg px-3 font-bold text-lp-on-brand underline-offset-4 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lp-on-brand"
                : cn(BUTTON.link, "flex min-h-11 items-center px-3"),
            )}
          >
            {t("login")}
          </Link>
          <a href={`${base}#demo`} className={green ? BUTTON.sand : BUTTON.primary}>
            {t("demo")}
          </a>
        </div>

        <MobileMenu
          className="ms-auto lg:hidden"
          onDark={green}
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
