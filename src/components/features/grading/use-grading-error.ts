"use client";

import { useTranslations } from "next-intl";

/** Translates a `grading.errors` key; an unknown key falls back to the generic message. */
export function useGradingError(): (key: string) => string {
  const tErrors = useTranslations("grading.errors");
  return (key) => {
    const k = key as Parameters<typeof tErrors>[0];
    return tErrors.has(k) ? tErrors(k) : tErrors("generic");
  };
}
