"use client";

import { useTranslations } from "next-intl";

/** Translates a `teachers.errors` key; an unknown key falls back to the generic message. */
export function useTeachersError(): (key: string) => string {
  const tErrors = useTranslations("teachers.errors");
  return (key) => {
    const k = key as Parameters<typeof tErrors>[0];
    return tErrors.has(k) ? tErrors(k) : tErrors("generic");
  };
}
