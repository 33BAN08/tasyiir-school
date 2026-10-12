import { getRequestConfig } from "next-intl/server";

// Step 2: Arabic only. Step 3 adds [locale] routing (ar/fr/en) and RTL/LTR switching.
const DEFAULT_LOCALE = "ar";

export default getRequestConfig(async () => {
  const locale = DEFAULT_LOCALE;
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
