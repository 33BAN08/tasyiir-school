import { ArrowLeft, CalendarX } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { ImportWizard } from "@/components/features/students/import/import-wizard";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { getPermissions, requireSchoolPermission } from "@/lib/auth/session";
import { listClasses } from "@/lib/structure/classes";
import { getCurrentYear } from "@/lib/students/students";

export default async function ImportStudentsPage() {
  const user = await requireSchoolPermission("students.manage");
  const [year, permissions, t] = await Promise.all([
    getCurrentYear(user.schoolId),
    getPermissions(),
    getTranslations("students.import"),
  ]);
  const classes = year ? await listClasses(user.schoolId, year.id) : [];

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" className="self-start" asChild>
        <Link href="/students">
          <ArrowLeft className="rtl:rotate-180" aria-hidden />
          {t("back")}
        </Link>
      </Button>
      <PageHeader title={t("title")} description={t("description")} />
      {year ? (
        <ImportWizard exampleClass={classes[0]?.name ?? null} />
      ) : (
        <Card className="py-0">
          <EmptyState
            icon={CalendarX}
            title={t("noYear.title")}
            description={t("noYear.description")}
            action={
              permissions.has("structure.manage") && (
                <Button variant="outline" asChild>
                  <Link href="/setup/years">{t("noYear.action")}</Link>
                </Button>
              )
            }
          />
        </Card>
      )}
    </div>
  );
}
