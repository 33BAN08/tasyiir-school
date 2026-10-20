import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { homeFor } from "@/lib/auth/roles";
import { getCurrentSchool, getCurrentUser } from "@/lib/auth/session";
import { BRAND, BRAND_ASSETS } from "@/lib/brand";

/**
 * School logo + name (white-label), or the Tasyiir brand for the platform
 * owner. Links to the signed-in user's home (portal, dashboard, platform).
 */
export async function SchoolBrand() {
  const [school, user, t] = await Promise.all([getCurrentSchool(), getCurrentUser(), getTranslations("shell")]);
  const title = school?.name ?? BRAND.product;
  const subtitle = school ? BRAND.product : t("platform");

  return (
    <Link
      href={user ? homeFor(user) : "/"}
      className="flex min-w-0 items-center gap-2 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {school?.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- logos come from Supabase Storage
        <img src={school.logoUrl} alt="" className="size-8 shrink-0 rounded-lg object-cover" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- static SVG
        <img src={BRAND_ASSETS.icon} alt="" className="size-8 shrink-0 rounded-lg" />
      )}
      <div className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
        <span className="truncate font-semibold" dir="auto">
          {title}
        </span>
        <span className="truncate text-xs text-muted-foreground" dir="auto">
          {subtitle}
        </span>
      </div>
    </Link>
  );
}
