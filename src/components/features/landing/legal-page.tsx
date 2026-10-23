import { ArrowLeft, MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { LEGAL } from "@/lib/brand";
import { latinThenArabic } from "@/lib/fonts";
import { whatsappUrl } from "@/lib/landing/whatsapp";
import { cn } from "@/lib/utils";

import { BUTTON, WRAP } from "./landing-ui";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

export type LegalDoc = "privacy" | "terms";

type Section = { title: string; paragraphs?: string[]; items?: string[]; paragraphs_after?: string[] };

/** "2026-10-23" → "23/10/2026" (dd/MM/yyyy in every language, docs/DESIGN.md). */
const shownDate = (iso: string) => iso.split("-").reverse().join("/");

/** Privacy policy or terms of use (/privacy, /terms): the home page's header, footer and light palette. */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  const t = useTranslations("legal");
  const sections = t.raw(`${doc}.sections`) as Section[];
  const fill = (text: string) => text.replaceAll("{publisher}", LEGAL.publisher);
  const whatsapp = whatsappUrl(t("whatsappMessage"));
  const other: LegalDoc = doc === "privacy" ? "terms" : "privacy";

  return (
    <div
      className="landing relative flex flex-1 flex-col bg-lp-bg text-lp-ink rtl:leading-[1.7]"
      style={{ fontFamily: latinThenArabic() }}
    >
      <SiteHeader page={`/${doc}`} />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <article className={cn(WRAP, "max-w-3xl py-12 sm:py-16")} data-legal={doc}>
          <Link href="/" className={cn(BUTTON.link, "inline-flex min-h-11 items-center gap-2 text-sm")}>
            <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
            {t("home")}
          </Link>
          <h1 className="mt-4 text-3xl font-extrabold text-lp-brand-strong sm:text-4xl">{t(`${doc}.title`)}</h1>
          <p className="mt-2 text-sm text-lp-muted">{t("updated", { date: shownDate(LEGAL.updated) })}</p>
          <p className="mt-6 text-lg">{t(`${doc}.intro`)}</p>

          {sections.map((section) => (
            <section key={section.title} className="mt-10">
              <h2 className="text-xl font-bold">{section.title}</h2>
              {section.paragraphs?.map((p) => (
                <p key={p} className="mt-3">
                  {fill(p)}
                </p>
              ))}
              {section.items && (
                <ul className="mt-3 list-disc space-y-2 ps-6">
                  {section.items.map((item) => (
                    <li key={item}>{fill(item)}</li>
                  ))}
                </ul>
              )}
              {section.paragraphs_after?.map((p) => (
                <p key={p} className="mt-3">
                  {fill(p)}
                </p>
              ))}
            </section>
          ))}

          <section className="mt-10 rounded-lg border border-lp-line bg-lp-surface p-5" data-legal-contact>
            <h2 className="text-xl font-bold">{t("contactTitle")}</h2>
            <p className="mt-2">{LEGAL.publisher}</p>
            {whatsapp ? (
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={cn(BUTTON.whatsapp, "mt-4")}>
                <MessageCircle className="size-5" aria-hidden />
                {t("contactWhatsapp")}
              </a>
            ) : (
              <p className="mt-2 text-lp-muted">{t("contactFallback")}</p>
            )}
          </section>

          <p className="mt-8">
            <Link href={`/${other}`} className={BUTTON.link}>
              {t(`nav.${other}`)}
            </Link>
          </p>
        </article>
      </main>
      <SiteFooter onHome={false} />
    </div>
  );
}
