import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { LastChange } from "@/components/features/alerts/last-change";
import { SchoolContactForm } from "@/components/features/school-settings/school-contact-form";
import { PlanUsageCard } from "@/components/features/plan/plan-usage-card";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requireSchoolPermission } from "@/lib/auth/session";
import { getSchoolContact } from "@/lib/school-contact/contact";

/** The director's school settings: for now, the contact card parents see. */
export default async function SchoolSettingsPage() {
  const user = await requireSchoolPermission("settings.manage");
  const t = await getTranslations("schoolSettings");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<Skeleton className="h-32 w-full" />}>
        <PlanUsageCard />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-80 w-full" />}>
        <ContactSection schoolId={user.schoolId} />
      </Suspense>
    </div>
  );
}

async function ContactSection({ schoolId }: { schoolId: string }) {
  const contact = await getSchoolContact(schoolId, true);
  return (
    <div className="flex flex-col gap-4">
      <SchoolContactForm phone={contact?.phone ?? null} whatsapp={contact?.whatsapp ?? null} />
      {contact?.lastChange && (
        <LastChange at={contact.lastChange.at} byName={contact.lastChange.byName} namespace="schoolSettings" />
      )}
    </div>
  );
}
