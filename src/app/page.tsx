import { CalendarCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Suspense } from "react";

import { SessionPanel } from "@/components/features/home/session-panel";
import { SupabaseStatus } from "@/components/features/home/supabase-status";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BRAND } from "@/lib/brand";

// TEMP: placeholder home page; replaced by the app shell + role-based redirect in Phase 1 step 4.

export default function Home() {
  const t = useTranslations("home");

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-6 py-10 text-center">
          <div className="flex size-16 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <CalendarCheck className="size-9" aria-hidden />
          </div>

          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-semibold text-primary">{BRAND.nameAr}</h1>
            <p className="text-xl font-medium" dir="ltr">
              {BRAND.product}
            </p>
            <span className="mx-auto mt-2 h-1 w-10 rounded-full bg-accent" aria-hidden />
            <p className="mt-2 text-sm text-muted-foreground">{t("tagline")}</p>
          </div>

          <Suspense fallback={<Skeleton className="h-24 w-56" />}>
            <SessionPanel />
          </Suspense>

          <Suspense fallback={<Skeleton className="h-6 w-56" />}>
            <SupabaseStatus />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
