"use client";

import { useTranslations } from "next-intl";

/** Translates a `portal.absences.errors` key (the parent's pages); an unknown key falls back to the generic message. */
export function useJustificationError(): (key: string) => string {
  const tErrors = useTranslations("portal.absences.errors");
  return (key) => {
    const k = key as Parameters<typeof tErrors>[0];
    return tErrors.has(k) ? tErrors(k) : tErrors("generic");
  };
}

/** Same for the school's side: `absences.justifications.errors`. */
export function useStaffJustificationError(): (key: string) => string {
  const tErrors = useTranslations("absences.justifications.errors");
  return (key) => {
    const k = key as Parameters<typeof tErrors>[0];
    return tErrors.has(k) ? tErrors(k) : tErrors("generic");
  };
}
