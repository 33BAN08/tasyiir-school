"use client";

import { useTranslations } from "next-intl";

/** Translates a `portal.absences.errors` key; an unknown key falls back to the generic message. */
export function useJustificationError(): (key: string) => string {
  const tErrors = useTranslations("portal.absences.errors");
  return (key) => {
    const k = key as Parameters<typeof tErrors>[0];
    return tErrors.has(k) ? tErrors(k) : tErrors("generic");
  };
}
