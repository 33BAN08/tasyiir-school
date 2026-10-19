import { getTranslations } from "next-intl/server";

import { BackLink } from "@/components/layout/back-link";
import { Card, CardContent } from "@/components/ui/card";
import type { Announcement } from "@/lib/announcements/queries";

import { AnnouncementActions } from "./announcement-actions";
import { audienceText } from "./audience-line";
import { MarkSeen } from "./mark-seen";
import { PostedAt } from "./posted-at";

type Props = {
  announcement: Announcement;
  /** `/announcements` or `/portal/announcements`. */
  basePath: string;
  /** Staff see who it went to and may edit / delete their own (or any with announcements.manage). */
  staff: boolean;
  canChange: boolean;
};

/** One announcement: title, who and when, the full text (line breaks kept). */
export async function AnnouncementDetail({ announcement: a, basePath, staff, canChange }: Props) {
  const t = await getTranslations("announcements");
  const audience = staff ? await audienceText(a) : null;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <BackLink href={basePath} label={t("back")} />
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold break-words">
              <bdi>{a.title}</bdi>
            </h1>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
              <span>
                {t("postedAt")} <PostedAt value={a.createdAt} />
              </span>
              {a.updatedAt && (
                <span>
                  {t("editedAt")} <PostedAt value={a.updatedAt} />
                </span>
              )}
              {audience && <span>{audience}</span>}
            </p>
          </div>
          <p dir="auto" className="whitespace-pre-line break-words leading-relaxed">
            {a.body}
          </p>
          {canChange && (
            <div className="border-t pt-4">
              <AnnouncementActions id={a.id} title={a.title} body={a.body} backHref={basePath} />
            </div>
          )}
        </CardContent>
      </Card>
      <MarkSeen id={a.id} />
    </div>
  );
}
