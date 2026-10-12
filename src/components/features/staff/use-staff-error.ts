"use client";

import { useTranslations } from "next-intl";

/** Translates a `staff.errors` key; an unknown key falls back to the generic message, never a raw key. */
export function useStaffError(): (key: string) => string {
  const tErrors = useTranslations("staff.errors");
  return (key) => {
    const k = key as Parameters<typeof tErrors>[0];
    return tErrors.has(k) ? tErrors(k) : tErrors("generic");
  };
}
