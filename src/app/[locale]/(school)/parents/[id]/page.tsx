import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { GuardianAccountCard } from "@/components/features/parents/guardian-account-card";
import { GuardianChildrenCard } from "@/components/features/parents/guardian-children-card";
import { GuardianHeaderActions } from "@/components/features/parents/guardian-header-actions";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { getPermissions, requireSchoolPermission } from "@/lib/auth/session";
import { ltr } from "@/lib/format";
import { getGuardian } from "@/lib/parents/guardians";
import { formatMobile } from "@/lib/parents/phone";
import { guardianIdSchema } from "@/lib/validations/parents";

type Params = PageProps<"/[locale]/parents/[id]">["params"];

/** Sync shell + Suspense: the [id] segment is request-time, so navigations stay instant. */
export default function GuardianPage({ params }: PageProps<"/[locale]/parents/[id]">) {
  return (
    <Suspense fallback={<GuardianSkeleton />}>
      <GuardianDetail params={params} />
    </Suspense>
  );
}

function GuardianSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-9 w-72" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}

async function GuardianDetail({ params }: { params: Params }) {
  // Page-level check (inside the page's own tree, never only in a layout).
  const user = await requireSchoolPermission("parents.manage");
  const id = guardianIdSchema.safeParse((await params).id);
  if (!id.success) notFound();

  const [guardian, permissions, t] = await Promise.all([
    getGuardian(user.schoolId, id.data),
    getPermissions(),
    getTranslations("parents.detail"),
  ]);
  if (!guardian) notFound();
  const name = `${guardian.lastName} ${guardian.firstName}`;

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" className="self-start" asChild>
        <Link href="/parents">
          <ArrowLeft className="rtl:rotate-180" aria-hidden />
          {t("back")}
        </Link>
      </Button>
      <PageHeader
        title={name}
        description={[formatMobile(guardian.phone), guardian.email].filter(Boolean).map((v) => ltr(v!)).join(" · ")}
        actions={
          <GuardianHeaderActions
            guardianId={guardian.id}
            name={name}
            hasAccount={guardian.account !== "none"}
            defaults={{
              lastName: guardian.lastName,
              firstName: guardian.firstName,
              phone: formatMobile(guardian.phone),
              email: guardian.email ?? "",
            }}
          />
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {/* Linking needs to search students too: students.view (or .manage). */}
          <GuardianChildrenCard
            guardianId={guardian.id}
            items={guardian.children}
            canLink={permissions.has("students.view") || permissions.has("students.manage")}
          />
        </div>
        <GuardianAccountCard guardianId={guardian.id} phone={guardian.phone} status={guardian.account} />
      </div>
    </div>
  );
}
