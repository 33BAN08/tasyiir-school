import { ChevronRight, Megaphone } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/layout/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { ANNOUNCEMENT_LIMIT, type Announcement } from "@/lib/announcements/queries";

import { audienceText } from "./audience-line";
import { PostedAt } from "./posted-at";

type Props = {
  items: Announcement[];
  /** `/announcements` or `/portal/announcements`. */
  basePath: string;
  userId: string;
  /** Staff see who each one went to; parents do not need it. */
  showAudience: boolean;
};

/** Newest first: title, the first lines of the text, when, and (staff) who it went to. */
export async function AnnouncementList({ items, basePath, userId, showAudience }: Props) {
  const t = await getTranslations("announcements");
  if (items.length === 0) {
    return (
      <Card className="py-0">
        <EmptyState icon={Megaphone} title={t("emptyTitle")} description={t(showAudience ? "emptyStaff" : "emptyParent")} />
      </Card>
    );
  }
  const audiences = showAudience ? await Promise.all(items.map(audienceText)) : [];

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y rounded-lg border bg-card">
        {items.map((a, i) => (
          <li key={a.id}>
            <Link href={`${basePath}/${a.id}`} className="flex min-h-14 items-start gap-3 p-4 text-start hover:bg-muted/50">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Megaphone className="size-5" aria-hidden />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <bdi className="text-base font-semibold break-words">{a.title}</bdi>
                  {a.createdBy === userId && <Badge variant="secondary">{t("mine")}</Badge>}
                </span>
                <span dir="auto" className="line-clamp-2 text-sm break-words text-muted-foreground">
                  {a.body}
                </span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <PostedAt value={a.createdAt} />
                  {showAudience && <span>{audiences[i]}</span>}
                </span>
              </span>
              <ChevronRight className="mt-2 size-4 shrink-0 text-muted-foreground rtl:-scale-x-100" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      {items.length >= ANNOUNCEMENT_LIMIT && (
        <p className="text-xs text-muted-foreground">{t("limit", { count: ANNOUNCEMENT_LIMIT })}</p>
      )}
    </div>
  );
}
