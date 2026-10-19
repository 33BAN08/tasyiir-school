"use client";

import { useTranslations } from "next-intl";

const KNOWN = new Set(["typeRequired", "bodyRequired", "bodyTooLong", "invalid", "forbidden", "notFound", "notEnrolled", "locked", "failed"]);

/** Error key from the validation or an action → its sentence (`remarks.errors`). */
export function useRemarkError() {
  const t = useTranslations("remarks.errors");
  return (key: string) => t(KNOWN.has(key) ? key : "failed");
}
