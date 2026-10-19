import { BellOff } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { AlertRulesForm } from "@/components/features/alerts/alert-rules-form";
import { LastChange } from "@/components/features/alerts/last-change";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAlertRules } from "@/lib/alerts/rules";
import { getModules } from "@/lib/auth/modules";
import { requireSchoolPermission } from "@/lib/auth/session";

/** The director's automatic alerts (alerts module: Pro / Premium). */
export default async function AlertSettingsPage() {
  const user = await requireSchoolPermission("alerts.manage");
  const t = await getTranslations("alertSettings");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<RulesSkeleton />}>
        <RulesSection schoolId={user.schoolId} />
      </Suspense>
    </div>
  );
}

async function RulesSection({ schoolId }: { schoolId: string }) {
  const [modules, t] = await Promise.all([getModules(), getTranslations("alertSettings")]);
  // RLS also hides the rules when the module is off: both lead here.
  const rules = modules.has("alerts") ? await getAlertRules(schoolId) : null;
  if (!rules) {
    return (
      <Card className="py-0">
        <EmptyState icon={BellOff} title={t("notInPlanTitle")} description={t("notInPlanDescription")} />
      </Card>
    );
  }

  const { lastChange, ...defaults } = rules;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("instantNote")}</p>
      <AlertRulesForm defaults={defaults} />
      {lastChange && <LastChange at={lastChange.at} byName={lastChange.byName} />}
    </div>
  );
}

function RulesSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
