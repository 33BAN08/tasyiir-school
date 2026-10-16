"use client";

import { useTranslations } from "next-intl";

import { ListFilters } from "@/components/layout/list-filters";

export function GuardiansFilters() {
  const t = useTranslations("parents");
  return (
    <ListFilters
      searchLabel={t("searchLabel")}
      searchPlaceholder={t("searchPlaceholder")}
      loadingLabel={t("loading")}
      selects={[]}
    />
  );
}
