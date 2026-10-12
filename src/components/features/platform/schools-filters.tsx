"use client";

import { useTranslations } from "next-intl";

import { ListFilters } from "@/components/layout/list-filters";
import { SCHOOL_STATUSES } from "@/lib/validations/platform";

export function SchoolsFilters() {
  const t = useTranslations("platform.schools");
  const tStatus = useTranslations("platform.schoolStatus");

  return (
    <ListFilters
      searchLabel={t("searchLabel")}
      searchPlaceholder={t("searchPlaceholder")}
      loadingLabel={t("loading")}
      selects={[
        {
          param: "status",
          label: t("statusFilterLabel"),
          allLabel: t("statusAll"),
          options: SCHOOL_STATUSES.map((status) => ({ value: status, label: tStatus(status) })),
        },
      ]}
    />
  );
}
