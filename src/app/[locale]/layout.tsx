import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { notFound } from "next/navigation";
import { locale as rootLocale } from "next/root-params";

import { ThemeScript } from "@/components/features/theme/theme-script";
import { DirectionProvider } from "@/components/ui/direction";
import { ServiceWorkerRegister } from "@/components/features/app/service-worker-register";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getDirection, routing } from "@/i18n/routing";
import { BRAND, OG_IMAGE, SITE_URL } from "@/lib/brand";
import { inter } from "@/lib/fonts";

import "../globals.css";

const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-plex-arabic",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("home");
  return {
    metadataBase: new URL(SITE_URL),
    title: BRAND.product,
    description: `${BRAND.product} — ${t("tagline")}`,
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/brand/tasyir-icon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/brand/tasyir-icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/brand/tasyir-icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: { url: "/brand/tasyir-icon-180.png", sizes: "180x180", type: "image/png" },
    },
    openGraph: { siteName: BRAND.product, type: "website", images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", images: [OG_IMAGE.url] },
  };
}

export default async function LocaleLayout({ children }: LayoutProps<"/[locale]">) {
  const locale = await rootLocale();
  if (!hasLocale(routing.locales, locale)) notFound();
  const dir = getDirection(locale);

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${plexArabic.variable} ${inter.variable} h-full antialiased`}
      // ThemeScript adds `dark` + color-scheme before React hydrates.
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          <DirectionProvider dir={dir}>
            <TooltipProvider>
              {children}
              <ServiceWorkerRegister />
              <Toaster dir={dir} position={dir === "rtl" ? "bottom-left" : "bottom-right"} />
            </TooltipProvider>
          </DirectionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
