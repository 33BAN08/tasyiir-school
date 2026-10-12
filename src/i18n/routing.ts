import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["ar", "fr", "en"],
  defaultLocale: "ar",
  // Every URL carries its locale (/ar/..., /fr/..., /en/...).
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];

/** Each language's own name: identical in every UI language, like BRAND. */
export const LOCALE_NAMES: Record<Locale, string> = {
  ar: "العربية",
  fr: "Français",
  en: "English",
};

export function getDirection(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}
