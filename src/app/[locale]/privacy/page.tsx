import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { BRAND } from "@/lib/brand";
import { LegalPage } from "@/components/features/landing/legal-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.privacy");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    openGraph: { title: t("metaTitle"), description: t("metaDescription"), siteName: BRAND.product, type: "website" },
    alternates: { languages: { ar: "/ar/privacy", fr: "/fr/privacy", en: "/en/privacy" } },
  };
}

/** Public, fully static (PUBLIC_PATHS in src/proxy.ts). */
export default function PrivacyPage() {
  return <LegalPage doc="privacy" />;
}
