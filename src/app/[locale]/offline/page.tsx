import { WifiOff } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("offline");
  return { title: t("title"), robots: { index: false } };
}

/**
 * Shown by the service worker (public/sw.js) when the phone has no network. Static and
 * public, kept in the service worker's cache. "Réessayer" is a plain link to the address
 * the parent opened (empty href), so it works without JavaScript.
 */
export default async function OfflinePage() {
  const t = await getTranslations("offline");
  return (
    <main className="flex flex-1 items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm text-center" data-offline>
        <CardHeader className="items-center">
          <WifiOff className="mx-auto size-10 text-muted-foreground" aria-hidden />
          <CardTitle className="text-xl">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <a
            href=""
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {t("retry")}
          </a>
        </CardContent>
      </Card>
    </main>
  );
}
