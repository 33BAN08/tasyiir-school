import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import type { ParentHome } from "@/lib/parents/home";

/** The newest announcement addressed to this parent (RLS decides), "Nouveau" while its notification is unread. */
export function LatestAnnouncement({ latest }: { latest: NonNullable<ParentHome["announcements"]["latest"]> }) {
  const t = useTranslations("portal.home.announcement");

  return (
    <section aria-labelledby="latest-announcement-title" className="flex flex-col gap-2" data-latest-announcement>
      <h2 id="latest-announcement-title" className="text-sm font-bold text-muted-foreground">
        {t("title")}
      </h2>
      <Link
        href={`/portal/announcements/${latest.id}`}
        className="flex flex-col gap-1.5 rounded-2xl border bg-card p-4 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex items-start justify-between gap-2">
          <span className="font-extrabold" dir="auto">
            {latest.title}
          </span>
          {latest.unread && (
            <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">{t("new")}</span>
          )}
        </span>
        <span className="line-clamp-2 text-sm text-muted-foreground" dir="auto">
          {latest.body}
        </span>
      </Link>
    </section>
  );
}
