import { Ban, Banknote, CheckCircle2, Clock, School } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { NewSchoolButton } from "@/components/features/platform/new-school-button";
import { SchoolsTable, SchoolsTableSkeleton } from "@/components/features/platform/schools-table";
import { StatCard, StatCardSkeleton } from "@/components/features/platform/stat-card";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { requireArea } from "@/lib/auth/session";
import { formatMoney } from "@/lib/format";
import { getPlatformStats, listSchools } from "@/lib/platform/schools";

const RECENT_COUNT = 5;

export default async function PlatformHomePage() {
  const user = await requireArea("platform");
  const t = await getTranslations("platform.dashboard");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("welcome", { name: user.fullName })}
        actions={<NewSchoolButton />}
      />
      <Suspense fallback={<StatsSkeleton />}>
        <Stats />
      </Suspense>
      <Card className="pb-0">
        <CardHeader>
          <CardTitle>{t("recentSchools")}</CardTitle>
          <CardAction>
            <Button variant="link" size="sm" asChild>
              <Link href="/platform/schools">{t("viewAll")}</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <Suspense fallback={<SchoolsTableSkeleton rows={3} />}>
          <RecentSchools />
        </Suspense>
      </Card>
    </div>
  );
}

async function Stats() {
  const [stats, t] = await Promise.all([getPlatformStats(), getTranslations("platform.dashboard.stats")]);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <StatCard icon={School} label={t("totalSchools")} value={String(stats.totalSchools)} />
      <StatCard icon={CheckCircle2} label={t("activeSchools")} value={String(stats.activeSchools)} />
      <StatCard icon={Ban} label={t("suspendedSchools")} value={String(stats.suspendedSchools)} />
      <StatCard icon={Clock} label={t("trialSchools")} value={String(stats.trialSchools)} />
      <StatCard icon={Banknote} label={t("mrr")} value={formatMoney(stats.mrr)} hint={t("mrrHint")} />
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {Array.from({ length: 5 }, (_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

async function RecentSchools() {
  const [list, t] = await Promise.all([
    listSchools({ q: "", status: undefined, page: 1 }, RECENT_COUNT),
    getTranslations("platform.schools"),
  ]);

  if (list.total === 0) {
    return <EmptyState icon={School} title={t("emptyTitle")} description={t("emptyDescription")} />;
  }
  return (
    <div className="pb-2">
      <SchoolsTable items={list.items} />
    </div>
  );
}
