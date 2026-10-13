"use client";

import { useTranslations } from "next-intl";

/** Translates a `setup.errors` key; an unknown key falls back to the generic message. */
export function useSetupError(): (key: string) => string {
  const tErrors = useTranslations("setup.errors");
  return (key) => {
    const k = key as Parameters<typeof tErrors>[0];
    return tErrors.has(k) ? tErrors(k) : tErrors("generic");
  };
}
