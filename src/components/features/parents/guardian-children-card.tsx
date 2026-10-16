"use client";

import { Unlink } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDeleteDialog } from "@/components/features/setup/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "@/i18n/navigation";
import { unlinkChild } from "@/lib/parents/guardian-actions";
import type { GuardianChild } from "@/lib/parents/guardians";
import { studentName, studentOtherName } from "@/lib/students/names";

import { LinkChildDialog } from "./link-child-dialog";
import { useParentsError } from "./use-parents-error";

type Props = { guardianId: string; items: GuardianChild[]; canLink: boolean };

/** The guardian's children (relation each), link another, remove a link. */
export function GuardianChildrenCard({ guardianId, items, canLink }: Props) {
  const t = useTranslations("parents.children");
  const tRel = useTranslations("parents.relations");
  const locale = useLocale();
  const translateError = useParentsError();
  const router = useRouter();
  const [removing, setRemoving] = useState<GuardianChild | null>(null);
  const [isPending, startTransition] = useTransition();

  function unlink() {
    if (!removing) return;
    startTransition(async () => {
      const result = await unlinkChild(guardianId, removing.studentId);
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
        {canLink && (
          <CardAction>
            <LinkChildDialog guardianId={guardianId} linkedIds={items.map((c) => c.studentId)} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {items.map((c) => {
              const other = studentOtherName(c, locale);
              return (
                <li key={c.studentId} className="flex items-center gap-3 py-2">
                  <span className="flex min-w-0 flex-1 flex-col items-start">
                    <bdi className="font-medium">{studentName(c, locale)}</bdi>
                    {other && <bdi className="text-xs text-muted-foreground">{other}</bdi>}
                  </span>
                  <span className="text-sm text-muted-foreground">{tRel(c.relation)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("unlink", { name: studentName(c, locale) })}
                    onClick={() => setRemoving(c)}
                  >
                    <Unlink aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      <ConfirmDeleteDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={removing ? t("unlinkTitle", { name: studentName(removing, locale) }) : ""}
        description={t("unlinkDescription")}
        pending={isPending}
        onConfirm={unlink}
      />
    </Card>
  );
}
