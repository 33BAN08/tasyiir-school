import { ArrowLeft, Ban } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AuditCard } from "@/components/features/platform/school-detail/audit-card";
import { DirectorCard } from "@/components/features/platform/school-detail/director-card";
import { ModuleOverrides } from "@/components/features/platform/school-detail/module-overrides";
import { SchoolInfoForm } from "@/components/features/platform/school-detail/school-info-form";
import { SchoolStatusControl } from "@/components/features/platform/school-detail/school-status-control";
import { SubscriptionForm } from "@/components/features/platform/school-detail/subscription-form";
import { SchoolStatusBadge, SubscriptionStatusBadge } from "@/components/features/platform/status-badges";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { requireArea } from "@/lib/auth/session";
import { addDays, todayInCasablanca } from "@/lib/dates";
import { formatDate, formatDateTime } from "@/lib/format";
import { listActivePlans } from "@/lib/platform/plans";
import { getSchoolDetail } from "@/lib/platform/school-detail";
import { schoolIdSchema, type SubscriptionFormValues } from "@/lib/validations/platform";

type Params = PageProps<"/[locale]/platform/schools/[id]">["params"];

/** Sync shell + Suspense: the [id] segment is request-time, so navigations stay instant. */
export default function SchoolDetailPage({ params }: PageProps<"/[locale]/platform/schools/[id]">) {
  return (
    <Suspense fallback={<SchoolDetailSkeleton />}>
      <SchoolDetail params={params} />
    </Suspense>
  );
}

function SchoolDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-9 w-72" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-96 rounded-xl lg:col-span-2" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}

async function SchoolDetail({ params }: { params: Params }) {
  // Page-level check (inside the page's own tree, never only in a layout).
  await requireArea("platform");
  const id = schoolIdSchema.safeParse((await params).id);
  if (!id.success) notFound();

  const school = await getSchoolDetail(id.data);
  if (!school) notFound();

  const [plans, t] = await Promise.all([
    listActivePlans(school.subscription?.planId),
    getTranslations("platform.schoolDetail"),
  ]);
  const sub = school.subscription;
  const today = todayInCasablanca();
  const subscriptionDefaults: SubscriptionFormValues = sub
    ? {
        planId: sub.planId,
        subscriptionStatus: sub.status === "suspended" ? "active" : sub.status,
        startDate: sub.startDate,
        trialEndsOn: sub.trialEndsOn ?? "",
        endDate: sub.endDate ?? "",
      }
    : {
        planId: plans[0]?.id ?? "",
        subscriptionStatus: "trial",
        startDate: today,
        trialEndsOn: addDays(today, 30),
        endDate: "",
      };

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" className="w-fit" asChild>
        <Link href="/platform/schools">
          <ArrowLeft className="rtl:-scale-x-100" aria-hidden />
          {t("backToList")}
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">{school.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <bdi>{school.slug}</bdi>
            <SchoolStatusBadge status={school.status} />
            {sub && (
              // Two "Active" badges side by side are ambiguous: name the subscription.
              <span className="inline-flex items-center gap-1.5">
                {t("subscriptionLabel", { plan: sub.planName })}
                <SubscriptionStatusBadge status={sub.status} />
              </span>
            )}
            <span>{t("createdOn", { date: formatDate(school.createdAt) })}</span>
          </div>
        </div>
        <SchoolStatusControl schoolId={school.id} schoolName={school.name} status={school.status} />
      </div>

      {school.status === "suspended" && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-danger/40 bg-danger/5 p-4">
          <Ban className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
          <div className="flex flex-col gap-0.5">
            <p className="font-medium">{t("suspendedBanner.title")}</p>
            <p className="text-sm text-muted-foreground">
              {school.suspendedAt
                ? t("suspendedBanner.since", { date: formatDateTime(school.suspendedAt) })
                : t("suspendedBanner.description")}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <SchoolInfoForm
            schoolId={school.id}
            defaults={{
              name: school.name,
              city: school.city ?? "",
              phone: school.phone ?? "",
              address: school.address ?? "",
            }}
          />
          <SubscriptionForm
            schoolId={school.id}
            plans={plans}
            defaults={subscriptionDefaults}
            isNew={!sub}
          />
          <ModuleOverrides
            schoolId={school.id}
            modules={school.modules}
            planModules={school.planModules}
            overrides={school.overrides}
          />
        </div>
        <div className="flex flex-col gap-6">
          <DirectorCard directors={school.directors} />
          <AuditCard entries={school.audit} />
        </div>
      </div>
    </div>
  );
}
