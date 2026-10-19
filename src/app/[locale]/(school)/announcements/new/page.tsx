import { getLocale, getTranslations } from "next-intl/server";

import { AnnouncementForm } from "@/components/features/announcements/announcement-form";
import { BackLink } from "@/components/layout/back-link";
import { PageHeader } from "@/components/layout/page-header";
import { redirect } from "@/i18n/navigation";
import { getPoster } from "@/lib/announcements/poster";
import { getPostingOptions } from "@/lib/announcements/queries";
import { requireArea } from "@/lib/auth/session";

/** Post an announcement: announcements.manage (anyone) or a teacher (own classes). */
export default async function NewAnnouncementPage() {
  await requireArea("school");
  const poster = await getPoster();
  if (!poster) return redirect({ href: "/announcements", locale: await getLocale() });

  const [t, options] = await Promise.all([getTranslations("announcements"), getPostingOptions(poster, poster.canManage)]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <BackLink href="/announcements" label={t("back")} />
        <PageHeader title={t("form.createTitle")} description={t("form.createDescription")} />
      </div>
      <AnnouncementForm options={options} />
    </div>
  );
}
