import { BookOpen, Presentation } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { NewStaffDialog } from "@/components/features/staff/new-staff-dialog";
import { TeachersTable } from "@/components/features/teachers/teachers-table";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { getPermissions, requireSchoolPermission } from "@/lib/auth/session";
import { listAssignableRoles } from "@/lib/staff/staff";
import { listSubjects } from "@/lib/structure/subjects";
import { listTeachers } from "@/lib/teachers/teachers";

export default async function TeachersPage() {
  const user = await requireSchoolPermission("teachers.manage");
  const [permissions, t] = await Promise.all([getPermissions(), getTranslations("teachers")]);
  // "New teacher" = the staff form with only the teacher role; createStaff re-checks everything.
  const teacherRole = permissions.has("users.manage")
    ? (await listAssignableRoles(user.schoolId, { roleKey: user.roleKey, permissions })).filter((r) => r.key === "teacher")
    : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={teacherRole.length > 0 && <NewStaffDialog roles={teacherRole} buttonLabel={t("new")} />}
      />
      <Suspense fallback={<TeachersSkeleton />}>
        <TeacherResults schoolId={user.schoolId} canOpenStaff={permissions.has("users.view")} />
      </Suspense>
    </div>
  );
}

function TeachersSkeleton() {
  return (
    <Card className="flex flex-col gap-3 p-4">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </Card>
  );
}

async function TeacherResults({ schoolId, canOpenStaff }: { schoolId: string; canOpenStaff: boolean }) {
  const [teachers, subjects, permissions, t] = await Promise.all([
    listTeachers(schoolId),
    listSubjects(schoolId),
    getPermissions(),
    getTranslations("teachers"),
  ]);

  if (teachers.length === 0) {
    return (
      <Card className="py-0">
        <EmptyState icon={Presentation} title={t("emptyTitle")} description={t("emptyDescription")} />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {subjects.length === 0 && (
        <Card className="py-0">
          <EmptyState
            icon={BookOpen}
            title={t("noSubjectsTitle")}
            description={t("noSubjectsDescription")}
            action={
              permissions.has("structure.manage") && (
                <Button variant="outline" asChild>
                  <Link href="/setup/subjects">{t("goToSubjects")}</Link>
                </Button>
              )
            }
          />
        </Card>
      )}
      <Card className="py-0">
        <div className="flex flex-col gap-4 pb-4">
          <TeachersTable items={teachers} subjects={subjects} canOpenStaff={canOpenStaff} />
          <p className="px-4 text-sm text-muted-foreground">{t("count", { count: teachers.length })}</p>
        </div>
      </Card>
    </div>
  );
}
