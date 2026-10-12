import { ArrowLeft, PackageX } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { NewSchoolWizard } from "@/components/features/platform/new-school-wizard";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { requireArea } from "@/lib/auth/session";
import { todayInCasablanca } from "@/lib/dates";
import { generateTemporaryPassword } from "@/lib/password";
import { listActivePlans } from "@/lib/platform/plans";

export default async function NewSchoolPage() {
  await requireArea("platform");
  const [plans, t] = await Promise.all([listActivePlans(), getTranslations("platform.wizard")]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button variant="ghost" asChild>
            <Link href="/platform/schools">
              <ArrowLeft className="rtl:-scale-x-100" aria-hidden />
              {t("backToList")}
            </Link>
          </Button>
        }
      />
      {plans.length === 0 ? (
        <Card>
          <EmptyState icon={PackageX} title={t("noPlansTitle")} description={t("noPlansDescription")} />
        </Card>
      ) : (
        <NewSchoolWizard
          plans={plans}
          initialPassword={generateTemporaryPassword()}
          today={todayInCasablanca()}
        />
      )}
    </div>
  );
}
