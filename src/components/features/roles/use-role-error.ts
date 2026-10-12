"use client";

import { useTranslations } from "next-intl";

/** Translates a `staffRoles.errors` key; an unknown key falls back to the generic message. */
export function useRoleError(): (key: string) => string {
  const tErrors = useTranslations("staffRoles.errors");
  return (key) => {
    const k = key as Parameters<typeof tErrors>[0];
    return tErrors.has(k) ? tErrors(k) : tErrors("generic");
  };
}
