import { BookOpen } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { NewSubjectButton } from "@/components/features/setup/new-subject-button";
import { SetupTabs } from "@/components/features/setup/setup-tabs";
import { SubjectTemplateDialog } from "@/components/features/setup/subject-template-dialog";
import { SubjectsList } from "@/components/features/setup/subjects-list";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireSchoolPermission } from "@/lib/auth/session";
import { listSubjects, presentTemplateSubjects } from "@/lib/structure/subjects";

export default async function SubjectsPage() {
  const user = await requireSchoolPermission("structure.manage");
  const t = await getTranslations("setup");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <SetupTabs />
      <Suspense fallback={<SubjectsSkeleton />}>
        <SubjectsSection schoolId={user.schoolId} />
      </Suspense>
    </div>
  );
}

async function SubjectsSection({ schoolId }: { schoolId: string }) {
  const [subjects, t] = await Promise.all([listSubjects(schoolId), getTranslations("setup.subjects")]);
  const present = [...(await presentTemplateSubjects(subjects))];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        {subjects.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <SubjectTemplateDialog present={present} />
            <NewSubjectButton />
          </div>
        )}
      </div>
      {subjects.length === 0 ? (
        <Card className="py-0">
          <EmptyState
            icon={BookOpen}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <SubjectTemplateDialog present={present} variant="default" />
                <NewSubjectButton variant="outline" />
              </div>
            }
          />
        </Card>
      ) : (
        <>
          <SubjectsList subjects={subjects} />
          <p className="text-sm text-muted-foreground">{t("count", { count: subjects.length })}</p>
        </>
      )}
    </section>
  );
}

function SubjectsSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-10 w-64" />
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
