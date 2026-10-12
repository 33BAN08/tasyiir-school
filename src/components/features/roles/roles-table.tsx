import { Lock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { labelledRoles } from "@/lib/auth/roles";
import type { RoleOverview } from "@/lib/roles/roles";

export function RolesTable({ roles }: { roles: RoleOverview[] }) {
  const t = useTranslations("staffRoles");
  const tRoles = useTranslations("roles");
  const locale = useLocale();
  // Built-in roles first, then custom ones; each by its label in the UI language.
  const sorted = [
    ...labelledRoles(roles.filter((r) => r.isSystem), tRoles, locale),
    ...labelledRoles(roles.filter((r) => !r.isSystem), tRoles, locale),
  ];

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("columns.name")}</TableHead>
          <TableHead>{t("columns.type")}</TableHead>
          <TableHead>{t("columns.members")}</TableHead>
          <TableHead>{t("columns.permissions")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((role) => (
          <TableRow key={role.id}>
            <TableCell>
              <Link
                href={`/staff/roles/${role.id}`}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {role.label}
              </Link>
            </TableCell>
            <TableCell>
              <Badge variant={role.isSystem ? "secondary" : "outline"}>
                {role.key === "director" && <Lock aria-hidden />}
                {t(role.isSystem ? "builtIn" : "custom")}
              </Badge>
            </TableCell>
            <TableCell className="font-numeric tabular-nums">
              {role.memberCount > 0 ? (
                <Link
                  href={`/staff?role=${role.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {t("memberCount", { count: role.memberCount })}
                </Link>
              ) : (
                <span className="text-muted-foreground">{t("memberCount", { count: 0 })}</span>
              )}
            </TableCell>
            <TableCell className="font-numeric tabular-nums">
              {t("permissionCount", { count: role.permissions.length })}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
