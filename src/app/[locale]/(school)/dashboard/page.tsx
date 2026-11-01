import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { DirectorDashboard } from "@/components/features/dashboard/director-dashboard";
import { FeeTiles } from "@/components/features/dashboard/fee-tiles";
import { TeacherHome } from "@/components/features/teacher-home/teacher-home";
import { PageHeader } from "@/components/layout/page-header";
import { WelcomePlaceholder } from "@/components/layout/welcome-placeholder";
import { Skeleton } from "@/components/ui/skeleton";
import { schoolClock } from "@/lib/attendance/clock";
import { getModules } from "@/lib/auth/modules";
import { getPermissions, requireArea, type CurrentUser } from "@/lib/auth/session";
import { getDashboard } from "@/lib/dashboard/director";
import { getFeeSummary } from "@/lib/fees/reports";
import { formatDate, ltr } from "@/lib/format";
import { getCurrentYear } from "@/lib/students/students";

/**
 * School home: the teacher's day for teachers (Madar app refresh, 2026-10-25);
 * for staff the dashboard (2026-10-26), each card only with its permission and
 * module; a role that may see none of them keeps the welcome placeholder.
 */
export default async function SchoolDashboardPage() {
  // Page-level check: must run before anything is rendered.
  const user = await requireArea("school");
  if (user.roleKey === "teacher" && user.schoolId) return <TeacherHome user={{ ...user, schoolId: user.schoolId }} />;
  if (!user.schoolId) return <WelcomePlaceholder area="school" titleKey="schoolTitle" />;
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <StaffDashboard user={{ ...user, schoolId: user.schoolId }} />
    </Suspense>
  );
}

async function StaffDashboard({ user }: { user: CurrentUser & { schoolId: string } }) {
  const [permissions, modules, clock, year, t] = await Promise.all([
    getPermissions(), getModules(), schoolClock(), getCurrentYear(user.schoolId), getTranslations("dashboard"),
  ]);
  const fees = year && modules.has("fees") && permissions.has("fees.view") ? await getFeeSummary(year.id) : null;
  const header = <PageHeader title={t("schoolTitle")} description={t("subtitle", { date: ltr(formatDate(clock.date)) })} />;
  // The accountant: only the two fees tiles (Phase 13 step 7).
  if (user.roleKey === "accountant") {
    if (!fees) return <WelcomePlaceholder area="school" titleKey="schoolTitle" />;
    return (
      <div className="flex flex-col gap-4">
        {header}
        <FeeTiles fees={fees} />
      </div>
    );
  }
  const data = await getDashboard(user.schoolId, clock, { permissions, modules });
  if (!data.attendance && !data.grades && !data.counts && !fees) return <WelcomePlaceholder area="school" titleKey="schoolTitle" />;
  return (
    <div className="flex flex-col gap-4">
      {header}
      {fees && <FeeTiles fees={fees} />}
      <DirectorDashboard data={data} clock={clock} yearId={year?.id ?? null} />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
