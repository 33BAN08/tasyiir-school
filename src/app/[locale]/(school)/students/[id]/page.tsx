import { ArrowLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { StudentAttendanceCard } from "@/components/features/attendance/student-attendance-card";
import { StudentRemarksCard } from "@/components/features/remarks/student-remarks-card";
import { StudentGuardiansCard } from "@/components/features/parents/student-guardians-card";
import { StudentAvatar } from "@/components/features/students/student-avatar";
import type { ClassOption } from "@/components/features/students/student-dialog";
import { StudentHeaderActions } from "@/components/features/students/student-header-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { getPermissions, requireSchoolPermission } from "@/lib/auth/session";
import { formatDate, ltr } from "@/lib/format";
import { listStudentGuardians } from "@/lib/parents/guardians";
import { getRemarkStaff } from "@/lib/remarks/writer";
import { listClasses } from "@/lib/structure/classes";
import { studentInitials, studentName, studentOtherName } from "@/lib/students/names";
import { signPhotoUrls } from "@/lib/students/photos";
import { getCurrentYear, getStudent } from "@/lib/students/students";
import { studentIdSchema } from "@/lib/validations/students";

type Params = PageProps<"/[locale]/students/[id]">["params"];

/** Sync shell + Suspense: the [id] segment is request-time, so navigations stay instant. */
export default function StudentPage({ params }: PageProps<"/[locale]/students/[id]">) {
  return (
    <Suspense fallback={<StudentSkeleton />}>
      <StudentDetail params={params} />
    </Suspense>
  );
}

function StudentSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-14 w-72" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl lg:col-span-2" />
      </div>
    </div>
  );
}

async function StudentDetail({ params }: { params: Params }) {
  // Page-level check (inside the page's own tree, never only in a layout).
  const user = await requireSchoolPermission("students.view");
  const id = studentIdSchema.safeParse((await params).id);
  if (!id.success) notFound();

  const [year, permissions, locale, t] = await Promise.all([
    getCurrentYear(user.schoolId),
    getPermissions(),
    getLocale(),
    getTranslations("students"),
  ]);
  const student = await getStudent(user.schoolId, year?.id ?? null, id.data);
  if (!student) notFound();

  const canManage = permissions.has("students.manage");
  const [guardians, photoUrls, classes, remarkStaff] = await Promise.all([
    listStudentGuardians(user.schoolId, student.id),
    signPhotoUrls([student.photoPath]),
    canManage && year ? listClasses(user.schoolId, year.id) : Promise.resolve(null),
    getRemarkStaff(),
  ]);
  const classOptions: ClassOption[] | null = classes ? classes.map((c) => ({ id: c.id, name: c.name })) : null;
  const name = studentName(student, locale);
  const other = studentOtherName(student, locale);
  const photoUrl = (student.photoPath && photoUrls.get(student.photoPath)) || null;
  const initials = studentInitials(student);

  const facts: [string, ReactNode][] = [
    [t("columns.codeMassar"), student.codeMassar ? <bdi key="massar" className="font-numeric">{student.codeMassar}</bdi> : "—"],
    [t("columns.birthDate"), <span key="birth" className="font-numeric tabular-nums">{formatDate(student.birthDate)}</span>],
    [t("form.gender"), t(`form.genders.${student.gender}`)],
    [
      year ? t("form.classIn", { year: ltr(year.label) }) : t("columns.class"),
      student.className ? (
        <bdi key="class">{student.className}</bdi>
      ) : (
        <span key="class" className="text-muted-foreground">
          {t("noClass")}
        </span>
      ),
    ],
  ];

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" className="self-start" asChild>
        <Link href="/students">
          <ArrowLeft className="rtl:rotate-180" aria-hidden />
          {t("detail.back")}
        </Link>
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <StudentAvatar url={photoUrl} initials={initials} alt={t("photo.alt", { name })} className="size-16" />
          <div className="flex flex-col items-start gap-1">
            <h1 className="text-2xl font-semibold">
              <bdi>{name}</bdi>
            </h1>
            {other && <bdi className="text-muted-foreground">{other}</bdi>}
          </div>
        </div>
        {canManage && (
          <StudentHeaderActions
            studentId={student.id}
            name={name}
            classes={classOptions}
            yearLabel={year?.label ?? null}
            photo={{ schoolId: user.schoolId, name, initials, url: photoUrl }}
            defaults={{
              lastName: student.lastName,
              firstName: student.firstName,
              lastNameAr: student.lastNameAr ?? "",
              firstNameAr: student.firstNameAr ?? "",
              birthDate: student.birthDate,
              gender: student.gender,
              codeMassar: student.codeMassar ?? "",
              classId: student.classId ?? "",
            }}
          />
        )}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("detail.infoTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
              {facts.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        <div className="lg:col-span-2">
          <StudentGuardiansCard
            studentId={student.id}
            studentName={name}
            items={guardians}
            canManage={permissions.has("parents.manage")}
          />
        </div>
        {permissions.has("attendance.view") && (
          <div className="lg:col-span-3">
            <Suspense fallback={<Skeleton className="h-48 w-full" />}>
              <StudentAttendanceCard schoolId={user.schoolId} studentId={student.id} />
            </Suspense>
          </div>
        )}
        {remarkStaff && (
          <div className="lg:col-span-3">
            <Suspense fallback={<Skeleton className="h-40 w-full" />}>
              <StudentRemarksCard staff={remarkStaff} studentId={student.id} studentName={name} />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}
