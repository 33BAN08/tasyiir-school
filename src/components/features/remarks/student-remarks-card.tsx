import { getTranslations } from "next-intl/server";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listStudentRemarks } from "@/lib/remarks/queries";
import type { RemarkStaff } from "@/lib/remarks/writer";

import { RemarkDialog } from "./remark-dialog";
import { RemarkItem } from "./remark-item";

type Props = { staff: RemarkStaff; studentId: string; studentName: string };

/** Student page: the student's remarks (RLS: the director / attendance.manage read all) and "Ajouter une remarque". */
export async function StudentRemarksCard({ staff, studentId, studentName }: Props) {
  const [t, remarks] = await Promise.all([getTranslations("remarks"), listStudentRemarks(studentId)]);
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>{t("title")}</CardTitle>
        {staff.canWrite && <RemarkDialog studentId={studentId} studentName={studentName} />}
      </CardHeader>
      <CardContent>
        {remarks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("emptyStudent")}</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {remarks.map((r) => (
              <RemarkItem key={r.id} remark={r} mode="staff" userId={staff.id} canModerate={staff.canModerate} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
