import { useTranslations } from "next-intl";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatDateTime } from "@/lib/format";
import type { StaffMemberDetail } from "@/lib/staff/staff";

import { StaffStatusBadge } from "../staff-status-badge";
import { BlockedNote } from "./blocked-note";
import { StaffActiveControl } from "./staff-active-control";
import { StaffPasswordReset } from "./staff-password-reset";

type Props = {
  member: StaffMemberDetail;
  /** Rule keys (null = allowed) for the two access actions. */
  blocked: { resetPassword: string | null; setActive: string | null };
};

export function StaffAccessCard({ member, blocked }: Props) {
  const t = useTranslations("staff.detail.access");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 text-sm">
          <dt className="text-muted-foreground">{t("status")}</dt>
          <dd>
            <StaffStatusBadge status={member.status} />
          </dd>
          {member.deactivatedAt && (
            <>
              <dt className="text-muted-foreground">{t("deactivatedAt")}</dt>
              <dd className="font-numeric tabular-nums">{formatDateTime(member.deactivatedAt)}</dd>
            </>
          )}
          <dt className="text-muted-foreground">{t("createdAt")}</dt>
          <dd className="font-numeric tabular-nums">{formatDate(member.createdAt)}</dd>
        </dl>

        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">{t("password")}</p>
          <p className="text-sm text-muted-foreground">{t("passwordHint")}</p>
          {blocked.resetPassword ? (
            <BlockedNote reason={blocked.resetPassword} />
          ) : (
            <div>
              <StaffPasswordReset staffId={member.id} name={member.fullName} />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">{t("account")}</p>
          <p className="text-sm text-muted-foreground">
            {member.status === "deactivated" ? t("reactivateHint") : t("deactivateHint")}
          </p>
          {blocked.setActive ? (
            <BlockedNote reason={blocked.setActive} />
          ) : (
            <div>
              <StaffActiveControl
                staffId={member.id}
                name={member.fullName}
                deactivated={member.status === "deactivated"}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
