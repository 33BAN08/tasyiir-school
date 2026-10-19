import { Inbox } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { DemoRequestList } from "@/components/features/platform/demo-requests/demo-request-list";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireArea } from "@/lib/auth/session";
import { DEMO_LIST_LIMIT, listDemoRequests } from "@/lib/demo-requests/queries";

/** The platform owner's inbox of "Demander une démo" requests from the home page. */
export default function DemoRequestsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <DemoRequests />
    </Suspense>
  );
}

async function DemoRequests() {
  // Page-level check (inside the page's own tree, never only in a layout).
  await requireArea("platform");
  const [items, t] = await Promise.all([listDemoRequests(), getTranslations("platform.demoRequests")]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      {items.length === 0 ? (
        <Card>
          <EmptyState icon={Inbox} title={t("emptyTitle")} description={t("emptyDescription")} />
        </Card>
      ) : (
        <>
          <DemoRequestList items={items} />
          {items.length === DEMO_LIST_LIMIT && (
            <p className="text-sm text-muted-foreground">{t("limit", { count: DEMO_LIST_LIMIT })}</p>
          )}
        </>
      )}
    </div>
  );
}
