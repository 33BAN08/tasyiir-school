import { SearchX, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { StaffFilters } from "@/components/features/staff/staff-filters";
import { StaffTable, StaffTableSkeleton } from "@/components/features/staff/staff-table";
import { EmptyState } from "@/components/layout/empty-state";
import { ListPagination } from "@/components/layout/list-pagination";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { requireSchoolPermission } from "@/lib/auth/session";
import { listStaff, listStaffRoles } from "@/lib/staff/staff";
import { staffListParamsSchema, type StaffListParams } from "@/lib/validations/staff";

const PATH = "/staff";

export default async function StaffPage({ searchParams }: PageProps<"/[locale]/staff">) {
  const user = await requireSchoolPermission("users.view");
  const [params, roles, t] = await Promise.all([
    searchParams.then((sp) => staffListParamsSchema.parse(sp)),
    listStaffRoles(user.schoolId),
    getTranslations("staff"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<Skeleton className="h-9 w-full max-w-md" />}>
        <StaffFilters roles={roles} />
      </Suspense>
      <Card className="py-0">
        {/* New filters = new key: show the skeleton while the next page loads. */}
        <Suspense key={JSON.stringify(params)} fallback={<StaffTableSkeleton />}>
          <StaffResults schoolId={user.schoolId} userId={user.id} params={params} />
        </Suspense>
      </Card>
    </div>
  );
}

type ResultsProps = { schoolId: string; userId: string; params: StaffListParams };

async function StaffResults({ schoolId, userId, params }: ResultsProps) {
  const [list, t] = await Promise.all([listStaff(schoolId, params), getTranslations("staff")]);

  if (list.total === 0) {
    // A school always has its director, so an empty list means filters exclude everyone.
    const filtered = Boolean(params.q || params.role || params.status);
    return (
      <EmptyState
        icon={filtered ? SearchX : Users}
        title={t(filtered ? "noResultsTitle" : "emptyTitle")}
        description={t(filtered ? "noResultsDescription" : "emptyDescription")}
        action={
          filtered && (
            <Button variant="outline" asChild>
              <Link href={PATH}>{t("clearFilters")}</Link>
            </Button>
          )
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <StaffTable items={list.items} currentUserId={userId} />
      <div className="flex flex-col gap-2 px-4">
        <p className="text-sm text-muted-foreground">{t("count", { count: list.total })}</p>
        <ListPagination
          pathname={PATH}
          query={{ q: params.q || undefined, role: params.role, status: params.status }}
          page={list.page}
          pageCount={list.pageCount}
        />
      </div>
    </div>
  );
}
