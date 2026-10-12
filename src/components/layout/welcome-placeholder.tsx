import { Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Card, CardContent } from "@/components/ui/card";
import type { Area } from "@/lib/auth/roles";
import { requireArea } from "@/lib/auth/session";

type Props = {
  area: Area;
  titleKey: "platformTitle" | "schoolTitle" | "portalTitle" | "driverTitle";
};

// TEMP (Phase 1): area home placeholder until each area gets its real dashboard.
export async function WelcomePlaceholder({ area, titleKey }: Props) {
  // Page-level check: must run before anything is rendered.
  const user = await requireArea(area);
  const t = await getTranslations("dashboard");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t(titleKey)}</h1>
        <p className="text-muted-foreground">{t("welcome", { name: user.fullName })}</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <Sparkles className="size-8 text-accent" aria-hidden />
          <p className="max-w-md text-sm text-muted-foreground">{t("comingSoon")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
