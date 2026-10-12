import { CheckCircle2, Clock, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SchoolDirector } from "@/lib/platform/school-detail";

export function DirectorCard({ directors }: { directors: SchoolDirector[] }) {
  const t = useTranslations("platform.schoolDetail.director");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {directors.length === 0 ? (
          <EmptyState icon={UserRound} title={t("noneTitle")} description={t("noneDescription")} />
        ) : (
          <ul className="flex flex-col gap-4">
            {directors.map((d) => (
              <li key={d.id} className="flex flex-col gap-1">
                <p className="font-medium">{d.fullName}</p>
                {d.email && (
                  <p className="text-sm text-muted-foreground">
                    <bdi className="break-all">{d.email}</bdi>
                  </p>
                )}
                <p className="flex items-center gap-1.5 text-sm">
                  {d.mustChangePassword ? (
                    <>
                      <Clock className="size-4 text-warning" aria-hidden />
                      {t("pendingFirstLogin")}
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="size-4 text-success" aria-hidden />
                      {t("activeAccount")}
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
