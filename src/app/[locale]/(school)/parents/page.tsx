import { SearchX, UsersRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { GuardiansFilters } from "@/components/features/parents/guardians-filters";
import { GuardiansTable, GuardiansTableSkeleton } from "@/components/features/parents/guardians-table";
import { NewGuardianButton } from "@/components/features/parents/new-guardian-button";
import { EmptyState } from "@/components/layout/empty-state";
import { ListPagination } from "@/components/layout/list-pagination";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { requireSchoolPermission } from "@/lib/auth/session";
import { listGuardians } from "@/lib/parents/guardians";
import { guardianListParamsSchema, type GuardianListParams } from "@/lib/validations/parents";

const PATH = "/parents";

export default async function ParentsPage({ searchParams }: PageProps<"/[locale]/parents">) {
  const user = await requireSchoolPermission("parents.manage");
  const [params, t] = await Promise.all([
    searchParams.then((sp) => guardianListParamsSchema.parse(sp)),
    getTranslations("parents"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} actions={<NewGuardianButton />} />
      <Suspense fallback={<Skeleton className="h-9 w-full max-w-md" />}>
        <GuardiansFilters />
      </Suspense>
      <Card className="py-0">
        <Suspense key={JSON.stringify(params)} fallback={<GuardiansTableSkeleton />}>
          <GuardianResults schoolId={user.schoolId} params={params} />
        </Suspense>
      </Card>
    </div>
  );
}

async function GuardianResults({ schoolId, params }: { schoolId: string; params: GuardianListParams }) {
  const [list, t] = await Promise.all([listGuardians(schoolId, params), getTranslations("parents")]);

  if (list.total === 0) {
    const filtered = Boolean(params.q);
    return (
      <EmptyState
        icon={filtered ? SearchX : UsersRound}
        title={t(filtered ? "noResultsTitle" : "emptyTitle")}
        description={t(filtered ? "noResultsDescription" : "emptyDescription")}
        action={
          filtered ? (
            <Button variant="outline" asChild>
              <Link href={PATH}>{t("clearFilters")}</Link>
            </Button>
          ) : (
            <NewGuardianButton />
          )
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <GuardiansTable items={list.items} />
      <div className="flex flex-col gap-2 px-4">
        <p className="text-sm text-muted-foreground">{t("count", { count: list.total })}</p>
        <ListPagination pathname={PATH} query={{ q: params.q || undefined }} page={list.page} pageCount={list.pageCount} />
      </div>
    </div>
  );
}
