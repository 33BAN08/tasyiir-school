import { CalendarCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { getCurrentSchool } from "@/lib/auth/session";
import { BRAND } from "@/lib/brand";

/** School logo + name (white-label), or the Tasyiir brand for the platform owner. */
export async function SchoolBrand() {
  const [school, t] = await Promise.all([getCurrentSchool(), getTranslations("shell")]);
  const title = school?.name ?? BRAND.product;
  const subtitle = school ? BRAND.product : t("platform");

  return (
    <div className="flex min-w-0 items-center gap-2">
      {school?.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- logos come from Supabase Storage
        <img src={school.logoUrl} alt="" className="size-8 shrink-0 rounded-lg object-cover" />
      ) : (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <CalendarCheck className="size-5" aria-hidden />
        </div>
      )}
      <div className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
        <span className="truncate font-semibold" dir="auto">
          {title}
        </span>
        <span className="truncate text-xs text-muted-foreground" dir="auto">
          {subtitle}
        </span>
      </div>
    </div>
  );
}
