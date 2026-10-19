"use client";

import { useTranslations } from "next-intl";

const KNOWN = new Set([
  "titleRequired",
  "titleTooLong",
  "bodyRequired",
  "bodyTooLong",
  "levelsRequired",
  "classesRequired",
  "invalid",
  "forbidden",
  "notFound",
  "noCurrentYear",
  "failed",
]);

/** Error key from the validation or an action → its sentence (`announcements.errors`). */
export function useAnnouncementError() {
  const t = useTranslations("announcements.errors");
  return (key: string) => t(KNOWN.has(key) ? key : "failed");
}
