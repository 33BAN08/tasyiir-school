import { getLocale, getTranslations } from "next-intl/server";

import { isolate } from "@/lib/format";
import type { Announcement } from "@/lib/announcements/queries";

/** "Tous les parents" / "Personnel" / "Parents · Classes : 1AC-A et 1AC-B": who it was sent to (staff only). */
export async function audienceText(a: Pick<Announcement, "scope" | "audience" | "levels" | "classes">): Promise<string> {
  const [t, locale] = await Promise.all([getTranslations("announcements.audience"), getLocale()]);
  if (a.scope === "school") return t(`school.${a.audience}`);
  const list = new Intl.ListFormat(locale === "ar" ? "ar-MA" : locale, { type: "conjunction" });
  const names = list.format((a.scope === "levels" ? a.levels : a.classes).map(isolate));
  return t(a.scope === "levels" ? "levels" : "classes", { names });
}
