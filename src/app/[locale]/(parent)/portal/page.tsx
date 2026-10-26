import { Baby } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { InstallAppCard } from "@/components/features/app/install-app-card";
import { HomeTiles } from "@/components/features/portal/home/home-tiles";
import { JustifyAlertCard } from "@/components/features/portal/home/justify-alert-card";
import { LatestAnnouncement } from "@/components/features/portal/home/latest-announcement";
import { ParentHero } from "@/components/features/portal/home/parent-hero";
import { SchoolContactCard } from "@/components/features/school-settings/school-contact-card";
import { EmptyState } from "@/components/layout/empty-state";
import { Card } from "@/components/ui/card";
import { schoolClock } from "@/lib/attendance/clock";
import { getModules } from "@/lib/auth/modules";
import { requireArea } from "@/lib/auth/session";
import { cardTitle } from "@/lib/grades/card-title";
import { listChildCards } from "@/lib/grades/publications";
import { getParentFirstName, getParentHome } from "@/lib/parents/home";
import { listMyChildren } from "@/lib/parents/portal";

/**
 * Parent home (mobile-first, Madar app refresh 2026-10-25): the greeting and a
 * chip per child on the green band; for the selected child, the absence to
 * justify (only when there is one), the tiles (absences, announcements,
 * remarks, timetable, grades with the grades module), the latest announcement; the install bar; the school's
 * contact card. Everything comes from the parent's own reads (RLS).
 */
export default async function PortalHomePage({ searchParams }: PageProps<"/[locale]/portal">) {
  // Page-level check: must run before anything is rendered.
  const user = await requireArea("portal");
  const [t, locale, sp] = await Promise.all([getTranslations("portal"), getLocale(), searchParams]);
  const [children, firstName] = user.schoolId
    ? await Promise.all([listMyChildren(user.schoolId), getParentFirstName(user.id)])
    : [[], null];
  const child = children.find((c) => c.id === sp.child) ?? children[0];
  const name = (firstName ?? user.fullName).trim();
  const chips = children.map((c) => ({
    id: c.id,
    name: locale === "ar" && c.firstNameAr ? c.firstNameAr : c.firstName,
    className: c.className,
  }));

  const clock = child && user.schoolId ? await schoolClock() : null;
  const home = child && user.schoolId && clock ? await getParentHome(user.schoolId, user.id, child, clock) : null;
  // Grades tile: only with the grades module; its line = the newest published card.
  const modules = child ? await getModules() : null;
  let gradesLine: string | null = null;
  if (child && modules?.has("grades")) {
    const [cards, tp] = await Promise.all([listChildCards(child.id), getTranslations("grades.periods")]);
    gradesLine = cards[0] ? cardTitle(cards[0], tp) : "";
  }

  return (
    <div className="flex flex-col gap-5">
      <ParentHero firstName={name} chips={chips} selected={child?.id ?? null} />
      {!child || !home || !clock ? (
        <Card>
          <EmptyState icon={Baby} title={t("emptyTitle")} description={t("emptyDescription")} />
        </Card>
      ) : (
        <>
          {home.toJustify && <JustifyAlertCard childId={child.id} absence={home.toJustify} today={clock.date} />}
          <HomeTiles childId={child.id} hasClass={!!child.classId} home={home} todayWeekday={clock.weekday} gradesLine={gradesLine} />
          {home.announcements.latest && <LatestAnnouncement latest={home.announcements.latest} />}
        </>
      )}
      <InstallAppCard />
      {user.schoolId && <SchoolContactCard schoolId={user.schoolId} />}
    </div>
  );
}
