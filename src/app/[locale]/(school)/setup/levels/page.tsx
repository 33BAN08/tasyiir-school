import { GraduationCap } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { LevelsList } from "@/components/features/setup/levels-list";
import { NewLevelButton } from "@/components/features/setup/new-level-button";
import { SetupTabs } from "@/components/features/setup/setup-tabs";
import { TemplateDialog } from "@/components/features/setup/template-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireSchoolPermission } from "@/lib/auth/session";
import { listLevelsByCycle } from "@/lib/structure/levels";
import { presentTemplateTracks } from "@/lib/structure/template-names";

export default async function LevelsPage() {
  const user = await requireSchoolPermission("structure.manage");
  const t = await getTranslations("setup");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <SetupTabs />
      <Suspense fallback={<LevelsSkeleton />}>
        <LevelsSection schoolId={user.schoolId} />
      </Suspense>
    </div>
  );
}

async function LevelsSection({ schoolId }: { schoolId: string }) {
  const [groups, t] = await Promise.all([listLevelsByCycle(schoolId), getTranslations("setup.levels")]);
  const levels = groups.flatMap((g) => g.levels);
  const existing = {
    levels: levels.map((l) => l.name.toLowerCase()),
    tracks: [...(await presentTemplateTracks(levels))],
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        {levels.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <TemplateDialog existing={existing} />
            <NewLevelButton />
          </div>
        )}
      </div>
      {levels.length === 0 ? (
        <Card className="py-0">
          <EmptyState
            icon={GraduationCap}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <TemplateDialog existing={existing} variant="default" />
                <NewLevelButton variant="outline" />
              </div>
            }
          />
        </Card>
      ) : (
        <LevelsList groups={groups} />
      )}
    </section>
  );
}

function LevelsSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-48 w-full" />
      ))}
    </div>
  );
}
