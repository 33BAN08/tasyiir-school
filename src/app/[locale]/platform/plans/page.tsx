import { PackageX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { PlanCard } from "@/components/features/platform/plans/plan-card";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireArea } from "@/lib/auth/session";
import { listModuleKeys, listPlansForAdmin } from "@/lib/platform/plans";

export default function PlansPage() {
  return (
    <Suspense fallback={<PlansSkeleton />}>
      <Plans />
    </Suspense>
  );
}

function PlansSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-56" />
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-80 w-full rounded-xl" />
      ))}
    </div>
  );
}

async function Plans() {
  // Page-level check (inside the page's own tree, never only in a layout).
  await requireArea("platform");
  const [plans, moduleKeys, t] = await Promise.all([
    listPlansForAdmin(),
    listModuleKeys(),
    getTranslations("platform.plans"),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      {plans.length === 0 ? (
        <Card>
          <EmptyState icon={PackageX} title={t("emptyTitle")} description={t("emptyDescription")} />
        </Card>
      ) : (
        plans.map((plan) => <PlanCard key={plan.id} plan={plan} moduleKeys={moduleKeys} />)
      )}
    </div>
  );
}
