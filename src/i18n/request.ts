import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { locale as rootLocale } from "next/root-params";

import { routing } from "./routing";

export default getRequestConfig(async ({ locale }) => {
  // An explicit `locale` (e.g. getTranslations({ locale })) wins; otherwise
  // read the [locale] root param, which keeps pages statically renderable.
  const requested = locale ?? (await rootLocale());
  const resolved = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale: resolved,
    messages: (await import(`../messages/${resolved}.json`)).default,
    timeZone: "Africa/Casablanca",
  };
});
