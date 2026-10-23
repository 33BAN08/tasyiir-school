import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { BRAND } from "@/lib/brand";
import { LegalPage } from "@/components/features/landing/legal-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.terms");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    openGraph: { title: t("metaTitle"), description: t("metaDescription"), siteName: BRAND.product, type: "website" },
    alternates: { languages: { ar: "/ar/terms", fr: "/fr/terms", en: "/en/terms" } },
  };
}

/** Public, fully static (PUBLIC_PATHS in src/proxy.ts). */
export default function TermsPage() {
  return <LegalPage doc="terms" />;
}
