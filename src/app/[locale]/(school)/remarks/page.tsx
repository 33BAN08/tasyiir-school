import { MessageSquareText } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { ClassSelect } from "@/components/features/attendance/class-select";
import { RemarkDialog } from "@/components/features/remarks/remark-dialog";
import { RemarkItem } from "@/components/features/remarks/remark-item";
import { StudentAvatar } from "@/components/features/students/student-avatar";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, redirect } from "@/i18n/navigation";
import { homeFor } from "@/lib/auth/roles";
import { getPermissions, requireArea } from "@/lib/auth/session";
import { listClassRemarks, listClassStudents, listRemarkClasses } from "@/lib/remarks/queries";
import { getRemarkStaff } from "@/lib/remarks/writer";
import { studentInitials, studentName, studentOtherName } from "@/lib/students/names";
import { signPhotoUrls } from "@/lib/students/photos";

/**
 * Remarks by class (current year): the class list with "Remarque" on each
 * student, and the class's latest remarks. A teacher sees the classes they
 * teach; attendance.manage / the director every class.
 */
export default async function RemarksPage({ searchParams }: PageProps<"/[locale]/remarks">) {
  const user = await requireArea("school");
  const staff = await getRemarkStaff();
  if (!staff) return redirect({ href: homeFor(user), locale: await getLocale() });

  const [t, locale, sp, permissions] = await Promise.all([getTranslations("remarks"), getLocale(), searchParams, getPermissions()]);
  const { yearId, classes } = await listRemarkClasses(staff, staff.isTeacher);
  const header = <PageHeader title={t("title")} description={t(staff.isTeacher ? "descriptionTeacher" : "descriptionStaff")} />;
  if (!yearId || classes.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <Card className="py-0">
          <EmptyState icon={MessageSquareText} title={t("noClassesTitle")} description={t(yearId ? "noClasses" : "noYear")} />
        </Card>
      </div>
    );
  }

  const klass = classes.find((c) => c.id === sp.class) ?? classes[0];
  const students = await listClassStudents(staff.schoolId, klass.id, yearId);
  const [remarks, photos] = await Promise.all([listClassRemarks(students.map((s) => s.id)), signPhotoUrls(students.map((s) => s.photoPath))]);
  const countOf = new Map<string, number>();
  for (const r of remarks) countOf.set(r.studentId, (countOf.get(r.studentId) ?? 0) + 1);
  const linkStudents = permissions.has("students.view");

  return (
    <div className="flex flex-col gap-4">
      {header}
      <ClassSelect classes={classes} value={klass.id} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-3">
          <CardHeader>
            <CardTitle>{t("classList", { count: students.length })}</CardTitle>
          </CardHeader>
          <CardContent>
            {students.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noStudents")}</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {students.map((s) => {
                  const name = studentName(s, locale);
                  const other = studentOtherName(s, locale);
                  const count = countOf.get(s.id) ?? 0;
                  return (
                    <li key={s.id} data-student={s.id} className="flex min-h-14 items-center gap-3 py-2">
                      <StudentAvatar
                        url={(s.photoPath && photos.get(s.photoPath)) || null}
                        initials={studentInitials(s)}
                        alt=""
                        className="size-10 shrink-0 text-xs"
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        {linkStudents ? (
                          <Link href={`/students/${s.id}`} className="truncate font-medium underline-offset-4 hover:underline">
                            <bdi>{name}</bdi>
                          </Link>
                        ) : (
                          <bdi className="truncate font-medium">{name}</bdi>
                        )}
                        <span className="truncate text-sm text-muted-foreground">
                          {other && <bdi>{other}</bdi>}
                          {other && count > 0 && " · "}
                          {count > 0 && t("count", { count })}
                        </span>
                      </span>
                      {staff.canWrite && <RemarkDialog studentId={s.id} studentName={name} compact />}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="gap-3">
          <CardHeader>
            <CardTitle>{t("latest")}</CardTitle>
          </CardHeader>
          <CardContent>
            {remarks.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("emptyClass")}</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {remarks.map((r) => (
                  <RemarkItem
                    key={r.id}
                    remark={r}
                    mode="staff"
                    userId={staff.id}
                    canModerate={staff.canModerate}
                    showStudent
                    studentHref={linkStudents}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
