import { GraduationCap, SearchX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { NewStudentButton } from "@/components/features/students/new-student-button";
import type { ClassOption } from "@/components/features/students/student-dialog";
import { StudentsFilters } from "@/components/features/students/students-filters";
import { StudentsTable, StudentsTableSkeleton } from "@/components/features/students/students-table";
import { EmptyState } from "@/components/layout/empty-state";
import { ListPagination } from "@/components/layout/list-pagination";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { getPermissions, requireSchoolPermission } from "@/lib/auth/session";
import { ltr } from "@/lib/format";
import { listClasses } from "@/lib/structure/classes";
import { getCurrentYear, listStudents } from "@/lib/students/students";
import { studentListParamsSchema, type StudentListParams } from "@/lib/validations/students";

const PATH = "/students";

export default async function StudentsPage({ searchParams }: PageProps<"/[locale]/students">) {
  const user = await requireSchoolPermission("students.view");
  const [params, year, permissions, t] = await Promise.all([
    searchParams.then((sp) => studentListParamsSchema.parse(sp)),
    getCurrentYear(user.schoolId),
    getPermissions(),
    getTranslations("students"),
  ]);
  const classes: ClassOption[] | null = year
    ? (await listClasses(user.schoolId, year.id)).map((c) => ({ id: c.id, name: c.name }))
    : null;
  // The button is a convenience; the actions re-check students.manage and RLS decides.
  const canManage = permissions.has("students.manage");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={year ? t("description", { year: ltr(year.label) }) : t("descriptionNoYear")}
        actions={canManage && <NewStudentButton classes={classes} yearLabel={year?.label ?? null} />}
      />
      <Suspense fallback={<Skeleton className="h-9 w-full max-w-md" />}>
        <StudentsFilters classes={classes} />
      </Suspense>
      <Card className="py-0">
        {/* New filters = new key: show the skeleton while the next page loads. */}
        <Suspense key={JSON.stringify(params)} fallback={<StudentsTableSkeleton />}>
          <StudentResults
            schoolId={user.schoolId}
            yearId={year?.id ?? null}
            yearLabel={year?.label ?? null}
            params={params}
            canManage={canManage}
            classes={classes}
          />
        </Suspense>
      </Card>
    </div>
  );
}

type ResultsProps = {
  schoolId: string;
  yearId: string | null;
  yearLabel: string | null;
  params: StudentListParams;
  canManage: boolean;
  classes: ClassOption[] | null;
};

async function StudentResults({ schoolId, yearId, yearLabel, params, canManage, classes }: ResultsProps) {
  const [list, t] = await Promise.all([listStudents(schoolId, yearId, params), getTranslations("students")]);

  if (list.total === 0) {
    const filtered = Boolean(params.q || params.class);
    return (
      <EmptyState
        icon={filtered ? SearchX : GraduationCap}
        title={t(filtered ? "noResultsTitle" : "emptyTitle")}
        description={t(filtered ? "noResultsDescription" : canManage ? "emptyDescription" : "emptyDescriptionReadOnly")}
        action={
          filtered ? (
            <Button variant="outline" asChild>
              <Link href={PATH}>{t("clearFilters")}</Link>
            </Button>
          ) : (
            canManage && <NewStudentButton classes={classes} yearLabel={yearLabel} />
          )
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <StudentsTable items={list.items} canManage={canManage} classes={classes} yearLabel={yearLabel} />
      <div className="flex flex-col gap-2 px-4">
        <p className="text-sm text-muted-foreground">{t("count", { count: list.total })}</p>
        <ListPagination
          pathname={PATH}
          query={{ q: params.q || undefined, class: params.class }}
          page={list.page}
          pageCount={list.pageCount}
        />
      </div>
    </div>
  );
}
