// Display names of the fees module. Plain module: used by server pages and
// client components (src/lib/fees/setup.ts is server-only).

/** Service name in the UI language (Arabic name when there is one). */
export function serviceName(service: { name: string; nameAr: string | null }, locale: string): string {
  return locale === "ar" && service.nameAr ? service.nameAr : service.name;
}
