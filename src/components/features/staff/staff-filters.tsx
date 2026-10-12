"use client";

import { useLocale, useTranslations } from "next-intl";

import { ListFilters } from "@/components/layout/list-filters";
import { labelledRoles } from "@/lib/auth/roles";
import { STAFF_STATUSES } from "@/lib/validations/staff";

type Props = { roles: { id: string; key: string; name: string }[] };

export function StaffFilters({ roles }: Props) {
  const t = useTranslations("staff");
  const tRoles = useTranslations("roles");
  const locale = useLocale();

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
          options: labelledRoles(roles, tRoles, locale).map((role) => ({ value: role.id, label: role.label })),
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
