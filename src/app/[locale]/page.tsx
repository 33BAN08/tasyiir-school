import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { LandingPage } from "@/components/features/landing/landing-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("landing.meta");
  return {
    title: t("title"),
    description: t("description"),
    alternates: { languages: { ar: "/ar", fr: "/fr", en: "/en" } },
  };
}

/**
 * The public home page: no session needed (PUBLIC_PATHS in src/proxy.ts), fully
 * static. Signed-in users reach their own area through /start (sign-in links
 * and every "home" redirect go there).
 */
export default function HomePage() {
  return <LandingPage />;
}
