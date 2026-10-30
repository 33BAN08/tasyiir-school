import { getLocale, getTranslations } from "next-intl/server";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCentimes } from "@/lib/fees/money";
import { serviceName } from "@/lib/fees/names";
import { getFeeMonths, getStudentFees, listFeeServices } from "@/lib/fees/setup";
import { isolate, ltr } from "@/lib/format";

import { StudentDiscountsBlock } from "./student-discounts-block";
import { StudentServicesBlock } from "./student-services-block";

type Props = {
  schoolId: string;
  year: { id: string; label: string };
  studentId: string;
  /** fees.manage: services. */
  canManage: boolean;
  /** fees.cancel: discounts. */
  canCancel: boolean;
};

/**
 * "Frais" card of the student page (fees module + fees.view): the level's fee,
 * the student's services and discounts for the current year, and the
 * brothers / sisters found through shared guardians (a hint, nothing applied).
 */
export async function StudentFeesCard({ schoolId, year, studentId, canManage, canCancel }: Props) {
  const [fees, months, services, locale, t] = await Promise.all([
    getStudentFees(schoolId, year.id, studentId),
    getFeeMonths(year.id),
    listFeeServices(schoolId, year.id),
    getLocale(),
    getTranslations("fees.student"),
  ]);
  const byId = new Map(services.map((s) => [s.id, s]));

  return (
    <Card data-student-fees>
      <CardHeader>
        <CardTitle>{t("title", { year: ltr(year.label) })}</CardTitle>
        {fees.enrolled && fees.levelName && (
          <CardDescription className="font-numeric">
            {fees.plan
              ? t("plan", { level: isolate(fees.levelName), amount: formatCentimes(fees.plan.monthly) })
              : t("noPlan", { level: isolate(fees.levelName) })}
            {fees.plan && fees.plan.registration > 0 && ` · ${t("planRegistration", { amount: formatCentimes(fees.plan.registration) })}`}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {!fees.enrolled ? (
          <p className="text-sm text-muted-foreground">{t("notEnrolled")}</p>
        ) : (
          <>
            <StudentServicesBlock
              studentId={studentId}
              yearId={year.id}
              periods={fees.periods.map((p) => {
                const s = byId.get(p.serviceId);
                return { ...p, name: s ? serviceName(s, locale) : "…", monthly: s?.monthly ?? 0 };
              })}
              services={services.filter((s) => s.active).map((s) => ({ id: s.id, label: serviceName(s, locale) }))}
              months={months?.months ?? []}
              canManage={canManage}
            />
            <StudentDiscountsBlock studentId={studentId} yearId={year.id} discounts={fees.discounts} canCancel={canCancel} />
          </>
        )}
        {fees.siblings.length > 0 && (
          <p className="text-sm text-muted-foreground" data-student-siblings>
            {t("siblings", {
              names: fees.siblings
                .map((s) => isolate(`${s.lastName} ${s.firstName}${s.className ? ` (${s.className})` : ""}`))
                .join(locale === "ar" ? "، " : ", "),
            })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
