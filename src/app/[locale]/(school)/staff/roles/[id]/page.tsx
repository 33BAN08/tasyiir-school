import { ArrowLeft, Lock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DeleteRoleButton } from "@/components/features/roles/delete-role-button";
import { RoleNameForm } from "@/components/features/roles/role-name-form";
import { RolePermissionsForm } from "@/components/features/roles/role-permissions-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { roleLabel } from "@/lib/auth/roles";
import { getPermissions, requireSchoolPermission } from "@/lib/auth/session";
import { getRole, listPermissionGroups } from "@/lib/roles/roles";
import { roleEditError } from "@/lib/roles/rules";
import { roleIdSchema } from "@/lib/validations/roles";

type Params = PageProps<"/[locale]/staff/roles/[id]">["params"];

/** Sync shell + Suspense: the [id] segment is request-time, so navigations stay instant. */
export default function RolePage({ params }: PageProps<"/[locale]/staff/roles/[id]">) {
  return (
    <Suspense fallback={<RoleSkeleton />}>
      <Role params={params} />
    </Suspense>
  );
}

function RoleSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}

async function Role({ params }: { params: Params }) {
  // Page-level check (inside the page's own tree, never only in a layout).
  const user = await requireSchoolPermission("roles.manage");
  const id = roleIdSchema.safeParse((await params).id);
  if (!id.success) notFound();

  const [role, groups, permissions, t, tRoles] = await Promise.all([
    getRole(user.schoolId, id.data),
    listPermissionGroups(),
    getPermissions(),
    getTranslations("staffRoles"),
    getTranslations("roles"),
  ]);
  if (!role) notFound();

  // Same rules as the Server Actions (which re-check everything).
  const actor = { roleKey: user.roleKey, roleId: user.roleId, permissions };
  const managed = { id: role.id, key: role.key, isSystem: role.isSystem };
  const permissionsBlocked = roleEditError(actor, managed, { kind: "permissions", added: [], removed: [] });
  const lockedKeys =
    user.roleKey === "director" ? [] : groups.flatMap((g) => g.permissions).filter((p) => !permissions.has(p));
  const canRename = roleEditError(actor, managed, { kind: "rename" }) === null;
  const canDelete = roleEditError(actor, managed, { kind: "delete", memberCount: role.memberCount }) === null;
  const name = roleLabel(role, tRoles);

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" className="w-fit" asChild>
        <Link href="/staff/roles">
          <ArrowLeft className="rtl:-scale-x-100" aria-hidden />
          {t("back")}
        </Link>
      </Button>

      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{name}</h1>
          <Badge variant={role.isSystem ? "secondary" : "outline"}>
            {role.key === "director" && <Lock aria-hidden />}
            {t(role.isSystem ? "builtIn" : "custom")}
          </Badge>
        </div>
        <p className="text-muted-foreground">
          {role.memberCount > 0 ? (
            <Link href={`/staff?role=${role.id}`} className="underline-offset-4 hover:underline">
              {t("memberCount", { count: role.memberCount })}
            </Link>
          ) : (
            t("memberCount", { count: 0 })
          )}
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RolePermissionsForm
            roleId={role.id}
            groups={groups}
            initial={role.permissions}
            blocked={permissionsBlocked}
            lockedKeys={lockedKeys}
          />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.title")}</CardTitle>
            <CardDescription>
              {role.isSystem ? t("settings.builtInDescription") : t("settings.customDescription")}
            </CardDescription>
          </CardHeader>
          {!role.isSystem && (
            <CardContent className="flex flex-col gap-6">
              {canRename && <RoleNameForm roleId={role.id} name={role.name} />}
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  {role.memberCount > 0 ? t("settings.inUse") : t("settings.deleteHint")}
                </p>
                {canDelete && (
                  <div>
                    <DeleteRoleButton roleId={role.id} name={role.name} />
                  </div>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
