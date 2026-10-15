"use client";

import { useTranslations } from "next-intl";

/** Translates a `students.errors` key; an unknown key falls back to the generic message. */
export function useStudentsError(): (key: string) => string {
  const tErrors = useTranslations("students.errors");
  return (key) => {
    const k = key as Parameters<typeof tErrors>[0];
    return tErrors.has(k) ? tErrors(k) : tErrors("generic");
  };
}
