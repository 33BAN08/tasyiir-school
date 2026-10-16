"use client";

import { Unlink } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDeleteDialog } from "@/components/features/setup/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, useRouter } from "@/i18n/navigation";
import { unlinkChild } from "@/lib/parents/guardian-actions";
import type { StudentGuardian } from "@/lib/parents/guardians";
import { formatMobile } from "@/lib/parents/phone";

import { AccountStatusBadge } from "./account-status-badge";
import { LinkGuardianDialog } from "./link-guardian-dialog";
import { NewGuardianLinkDialog } from "./new-guardian-link-dialog";
import { useParentsError } from "./use-parents-error";

type Props = {
  studentId: string;
  studentName: string;
  items: StudentGuardian[];
  /** parents.manage: link, create, unlink, open the parent's page. */
  canManage: boolean;
};

/** A student's father, mother and tuteurs: phone, account, link / create / unlink. */
export function StudentGuardiansCard({ studentId, studentName, items, canManage }: Props) {
  const t = useTranslations("students.guardians");
  const tRel = useTranslations("parents.relations");
  const translateError = useParentsError();
  const router = useRouter();
  const [removing, setRemoving] = useState<StudentGuardian | null>(null);
  const [isPending, startTransition] = useTransition();
  const taken = items.map((g) => g.relation);
  const nameOf = (g: StudentGuardian) => `${g.lastName} ${g.firstName}`;

  function unlink() {
    if (!removing) return;
    startTransition(async () => {
      const result = await unlinkChild(removing.id, studentId);
      setRemoving(null);
      if (!result.ok) {
        toast.error(translateError(result.error));
        return;
      }
      toast.success(t("unlinked"));
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
        {canManage && (
          <CardAction className="flex flex-wrap justify-end gap-2">
            <LinkGuardianDialog studentId={studentId} linkedIds={items.map((g) => g.id)} takenRelations={taken} />
            <NewGuardianLinkDialog studentId={studentId} studentName={studentName} takenRelations={taken} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {items.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                <span className="flex min-w-0 flex-1 flex-col items-start">
                  {canManage ? (
                    <Link href={`/parents/${g.id}`} className="font-medium underline-offset-4 hover:underline">
                      <bdi>{nameOf(g)}</bdi>
                    </Link>
                  ) : (
                    <bdi className="font-medium">{nameOf(g)}</bdi>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {tRel(g.relation)} ·{" "}
                    <bdi dir="ltr" className="font-numeric">
                      {formatMobile(g.phone)}
                    </bdi>
                  </span>
                </span>
                <AccountStatusBadge status={g.account} />
                {canManage && (
                  <Button variant="ghost" size="icon" aria-label={t("unlink", { name: nameOf(g) })} onClick={() => setRemoving(g)}>
                    <Unlink aria-hidden />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <ConfirmDeleteDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={removing ? t("unlinkTitle", { name: nameOf(removing) }) : ""}
        description={t("unlinkDescription")}
        pending={isPending}
        onConfirm={unlink}
      />
    </Card>
  );
}
