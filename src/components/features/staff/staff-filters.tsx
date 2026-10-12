"use client";

import { useTranslations } from "next-intl";

import { ListFilters } from "@/components/layout/list-filters";
import { roleLabel } from "@/lib/auth/roles";
import { STAFF_STATUSES } from "@/lib/validations/staff";

type Props = { roles: { id: string; key: string; name: string }[] };

export function StaffFilters({ roles }: Props) {
  const t = useTranslations("staff");
  const tRoles = useTranslations("roles");

  return (
    <ListFilters
      searchLabel={t("searchLabel")}
      searchPlaceholder={t("searchPlaceholder")}
      loadingLabel={t("loading")}
      selects={[
        {
          param: "role",
          label: t("roleFilterLabel"),
          allLabel: t("roleAll"),
          options: roles.map((role) => ({
            value: role.id,
            label: roleLabel(role, tRoles),
          })),
        },
        {
          param: "status",
          label: t("statusFilterLabel"),
          allLabel: t("statusAll"),
          options: STAFF_STATUSES.map((status) => ({ value: status, label: t(`status.${status}`) })),
        },
      ]}
    />
  );
}
