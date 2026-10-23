import { MessageCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { whatsappUrl } from "@/lib/landing/whatsapp";
import { cn } from "@/lib/utils";

import { SECTION_LINKS } from "./content";
import { LanguageLinks } from "./language-links";
import { Logo, WRAP } from "./landing-ui";

const LINK =
  "inline-flex min-h-11 items-center rounded-sm text-lp-muted outline-none hover:text-lp-ink hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-lp-brand";

/** `onHome` = the section links stay on this page; elsewhere they lead back to the home page's sections. */
export function SiteFooter({ onHome = true }: { onHome?: boolean }) {
  const t = useTranslations("landing");
  const tLegal = useTranslations("legal.nav");
  const locale = useLocale();
  const base = onHome ? "" : `/${locale}`;
  const whatsapp = whatsappUrl(t("demo.whatsappMessage"));

  return (
    // Bottom padding on phones: room for the sticky "Démo · WhatsApp" bar.
    <footer className="border-t border-lp-line bg-lp-bg pb-20 md:pb-0">
      <div className={cn(WRAP, "grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]")}>
        <div className="flex flex-col gap-4">
          <Logo />
          <p className="max-w-sm text-sm text-lp-muted">{t("footer.tagline")}</p>
          <LanguageLinks />
        </div>
        <nav aria-labelledby="footer-product">
          <h2 id="footer-product" className="mb-2 text-sm font-bold">
            {t("footer.product")}
          </h2>
          <ul className="text-sm">
            {SECTION_LINKS.map(({ id, key }) => (
              <li key={id}>
                <a href={`${base}#${id}`} className={LINK}>
                  {t(`nav.${key}`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-labelledby="footer-access">
          <h2 id="footer-access" className="mb-2 text-sm font-bold">
            {t("footer.access")}
          </h2>
          <ul className="text-sm">
            <li>
              <Link href="/login" className={LINK}>
                {t("nav.login")}
              </Link>
            </li>
            <li>
              <a href={`${base}#demo`} className={LINK}>
                {t("nav.demo")}
              </a>
            </li>
            <li>
              <Link href="/privacy" className={LINK}>
                {tLegal("privacy")}
              </Link>
            </li>
            <li>
              <Link href="/terms" className={LINK}>
                {tLegal("terms")}
              </Link>
            </li>
          </ul>
        </nav>
        {whatsapp && (
          <div>
            <h2 className="mb-2 text-sm font-bold">{t("footer.contact")}</h2>
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={cn(LINK, "gap-2 text-sm")}>
              <MessageCircle className="size-4" aria-hidden />
              {t("mobileBar.whatsapp")}
            </a>
          </div>
        )}
      </div>
      <div className="border-t border-lp-line">
        <div className={cn(WRAP, "flex flex-wrap items-center justify-between gap-2 py-5 text-sm text-lp-muted")}>
          <p>{t("footer.rights")}</p>
          <p>{t("footer.madeIn")}</p>
        </div>
      </div>
    </footer>
  );
}
