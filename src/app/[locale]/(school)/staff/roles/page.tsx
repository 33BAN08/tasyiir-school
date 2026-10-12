import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { NewRoleDialog } from "@/components/features/roles/new-role-dialog";
import { RolesTable } from "@/components/features/roles/roles-table";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireSchoolPermission } from "@/lib/auth/session";
import { listRoles } from "@/lib/roles/roles";

export default async function RolesPage() {
  const user = await requireSchoolPermission("roles.manage");
  const t = await getTranslations("staffRoles");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} actions={<NewRoleDialog />} />
      <Card className="py-0">
        <Suspense fallback={<RolesSkeleton />}>
          <RolesList schoolId={user.schoolId} />
        </Suspense>
      </Card>
    </div>
  );
}

async function RolesList({ schoolId }: { schoolId: string }) {
  const [roles, t] = await Promise.all([listRoles(schoolId), getTranslations("staffRoles")]);
  return (
    <div className="flex flex-col gap-4 pb-4">
      <RolesTable roles={roles} />
      <p className="px-4 text-sm text-muted-foreground">{t("count", { count: roles.length })}</p>
    </div>
  );
}

function RolesSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
