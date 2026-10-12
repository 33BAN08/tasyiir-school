import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { StaffAccessCard } from "@/components/features/staff/detail/staff-access-card";
import { StaffDetailsForm } from "@/components/features/staff/detail/staff-details-form";
import { StaffRoleForm } from "@/components/features/staff/detail/staff-role-form";
import { StaffStatusBadge } from "@/components/features/staff/staff-status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { roleLabel } from "@/lib/auth/roles";
import { getPermissions, requireSchoolPermission } from "@/lib/auth/session";
import { staffActionError, type StaffAction } from "@/lib/staff/rules";
import { getStaffMember, listAssignableRoles } from "@/lib/staff/staff";
import { staffIdSchema, type StaffDetailsFormValues } from "@/lib/validations/staff";

type Params = PageProps<"/[locale]/staff/[id]">["params"];

/** Sync shell + Suspense: the [id] segment is request-time, so navigations stay instant. */
export default function StaffMemberPage({ params }: PageProps<"/[locale]/staff/[id]">) {
  return (
    <Suspense fallback={<StaffMemberSkeleton />}>
      <StaffMember params={params} />
    </Suspense>
  );
}

function StaffMemberSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-9 w-72" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-96 rounded-xl lg:col-span-2" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}

async function StaffMember({ params }: { params: Params }) {
  // Page-level check (inside the page's own tree, never only in a layout).
  const user = await requireSchoolPermission("users.view");
  const id = staffIdSchema.safeParse((await params).id);
  if (!id.success) notFound();

  const [member, permissions, t, tRoles] = await Promise.all([
    getStaffMember(user.schoolId, id.data),
    getPermissions(),
    getTranslations("staff.detail"),
    getTranslations("roles"),
  ]);
  if (!member) notFound();

  // Same rules as the Server Actions (which re-check everything): only show what is allowed.
  const actor = { id: user.id, roleKey: user.roleKey, permissions };
  const canManage = permissions.has("users.manage");
  const blocked = (action: StaffAction) =>
    canManage
      ? staffActionError(
          actor,
          {
            id: member.id,
            roleKey: member.role.key,
            permissions: member.rolePermissions,
            deactivated: member.status === "deactivated",
          },
          action,
          { otherActiveDirectors: member.otherActiveDirectors },
        )
      : "readOnly";
  const roleBlocked = blocked("changeRole");
  const roles = canManage && !roleBlocked ? await listAssignableRoles(user.schoolId, actor) : [];

  const details: StaffDetailsFormValues = {
    fullName: member.fullName,
    phone: member.phone ?? "",
    locale: member.locale as StaffDetailsFormValues["locale"],
  };

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" className="w-fit" asChild>
        <Link href="/staff">
          <ArrowLeft className="rtl:-scale-x-100" aria-hidden />
          {t("back")}
        </Link>
      </Button>

      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{member.fullName}</h1>
          <StaffStatusBadge status={member.status} />
          {member.id === user.id && <span className="text-sm text-muted-foreground">({t("you")})</span>}
        </div>
        <p className="text-muted-foreground">
          {roleLabel(member.role, tRoles)}
          {member.email && (
            <>
              {" · "}
              <bdi className="break-all">{member.email}</bdi>
            </>
          )}
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <StaffDetailsForm staffId={member.id} defaultValues={details} blocked={blocked("edit")} />
          <StaffRoleForm staffId={member.id} currentRole={member.role} roles={roles} blocked={roleBlocked} />
        </div>
        <StaffAccessCard
          member={member}
          blocked={{
            resetPassword: blocked("resetPassword"),
            setActive: blocked(member.status === "deactivated" ? "reactivate" : "deactivate"),
          }}
        />
      </div>
    </div>
  );
}
