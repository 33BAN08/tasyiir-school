import { Baby, CalendarCheck, CalendarDays, MessageSquareText } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { InstallAppCard } from "@/components/features/app/install-app-card";
import { SchoolContactCard } from "@/components/features/school-settings/school-contact-card";
import { StudentAvatar } from "@/components/features/students/student-avatar";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { requireArea } from "@/lib/auth/session";
import { listMyChildren } from "@/lib/parents/portal";
import { studentInitials, studentName, studentOtherName } from "@/lib/students/names";
import { signPhotoUrls } from "@/lib/students/photos";

/** Parent home (mobile-first): their children, then how to reach the school. */
export default async function PortalHomePage() {
  // Page-level check: must run before anything is rendered.
  const user = await requireArea("portal");
  const [t, locale] = await Promise.all([getTranslations("portal"), getLocale()]);
  const children = user.schoolId ? await listMyChildren(user.schoolId) : [];
  const photos = await signPhotoUrls(children.map((c) => c.photoPath));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("welcome", { name: user.fullName })}</p>
      </div>
      <InstallAppCard />
      {children.length === 0 ? (
        <Card>
          <EmptyState icon={Baby} title={t("emptyTitle")} description={t("emptyDescription")} />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {children.map((child) => {
            const name = studentName(child, locale);
            const other = studentOtherName(child, locale);
            return (
              <li key={child.id}>
                <Card className="py-4">
                  <CardContent className="flex items-center gap-4">
                    <StudentAvatar
                      url={(child.photoPath && photos.get(child.photoPath)) || null}
                      initials={studentInitials(child)}
                      alt={t("photoAlt", { name })}
                      className="size-14 text-base"
                    />
                    <div className="flex min-w-0 flex-1 flex-col items-start">
                      <bdi className="text-base font-semibold">{name}</bdi>
                      {other && <bdi className="text-sm text-muted-foreground">{other}</bdi>}
                      <span className="text-sm text-muted-foreground">
                        {child.className ? (
                          <>
                            {t("class")} <bdi>{child.className}</bdi>
                          </>
                        ) : (
                          t("noClass")
                        )}
                      </span>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {child.classId && (
                          <Button asChild variant="outline" size="sm" className="min-h-11">
                            <Link href={`/portal/timetable?child=${child.id}`}>
                              <CalendarDays aria-hidden />
                              {t("timetable.open")}
                            </Link>
                          </Button>
                        )}
                        {child.classId && (
                          <Button asChild variant="outline" size="sm" className="min-h-11">
                            <Link href={`/portal/absences?child=${child.id}`}>
                              <CalendarCheck aria-hidden />
                              {t("absencesOpen")}
                            </Link>
                          </Button>
                        )}
                        {child.classId && (
                          <Button asChild variant="outline" size="sm" className="min-h-11">
                            <Link href={`/portal/remarks?child=${child.id}`}>
                              <MessageSquareText aria-hidden />
                              {t("remarksOpen")}
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      {user.schoolId && <SchoolContactCard schoolId={user.schoolId} />}
    </div>
  );
}
