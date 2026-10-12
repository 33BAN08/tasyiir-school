import { School, SearchX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { SchoolsFilters } from "@/components/features/platform/schools-filters";
import { SchoolsTable, SchoolsTableSkeleton } from "@/components/features/platform/schools-table";
import { EmptyState } from "@/components/layout/empty-state";
import { ListPagination } from "@/components/layout/list-pagination";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { requireArea } from "@/lib/auth/session";
import { listSchools } from "@/lib/platform/schools";
import { schoolListParamsSchema, type SchoolListParams } from "@/lib/validations/platform";

const PATH = "/platform/schools";

export default async function SchoolsPage({ searchParams }: PageProps<"/[locale]/platform/schools">) {
  await requireArea("platform");
  const [params, t] = await Promise.all([
    searchParams.then((sp) => schoolListParamsSchema.parse(sp)),
    getTranslations("platform.schools"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<Skeleton className="h-9 w-full max-w-md" />}>
        <SchoolsFilters />
      </Suspense>
      <Card className="py-0">
        {/* New filters = new key: show the skeleton while the next page loads. */}
        <Suspense key={JSON.stringify(params)} fallback={<SchoolsTableSkeleton />}>
          <SchoolsResults params={params} />
        </Suspense>
      </Card>
    </div>
  );
}

async function SchoolsResults({ params }: { params: SchoolListParams }) {
  const [list, t] = await Promise.all([listSchools(params), getTranslations("platform.schools")]);
  const filtered = Boolean(params.q || params.status);

  if (list.total === 0) {
    return filtered ? (
      <EmptyState
        icon={SearchX}
        title={t("noResultsTitle")}
        description={t("noResultsDescription")}
        action={
          <Button variant="outline" asChild>
            <Link href={PATH}>{t("clearFilters")}</Link>
          </Button>
        }
      />
    ) : (
      <EmptyState icon={School} title={t("emptyTitle")} description={t("emptyDescription")} />
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <SchoolsTable items={list.items} />
      <div className="flex flex-col gap-2 px-4">
        <p className="text-sm text-muted-foreground">{t("count", { count: list.total })}</p>
        <ListPagination
          pathname={PATH}
          query={{ q: params.q || undefined, status: params.status }}
          page={list.page}
          pageCount={list.pageCount}
        />
      </div>
    </div>
  );
}
