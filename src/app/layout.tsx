import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic, Inter } from "next/font/google";

import { DirectionProvider } from "@/components/ui/direction";
import { Toaster } from "@/components/ui/sonner";
import { BRAND } from "@/lib/brand";

import "./globals.css";

const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-plex-arabic",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: BRAND.product,
  description: `${BRAND.product} — ${BRAND.nameAr}`,
};

// Phase 0: Arabic RTL by default. Phase 1 makes lang/dir follow the next-intl locale.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${plexArabic.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <DirectionProvider dir="rtl">
          {children}
          <Toaster />
        </DirectionProvider>
      </body>
    </html>
  );
}
