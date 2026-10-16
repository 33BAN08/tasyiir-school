"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDeleteDialog } from "@/components/features/setup/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { deleteGuardian } from "@/lib/parents/guardian-actions";
import type { GuardianFormValues } from "@/lib/validations/parents";

import { GuardianDialog } from "./guardian-dialog";
import { useParentsError } from "./use-parents-error";

type Props = { guardianId: string; name: string; hasAccount: boolean; defaults: GuardianFormValues };

/** Edit (dialog) and delete (confirmation, then back to the list). */
export function GuardianHeaderActions({ guardianId, name, hasAccount, defaults }: Props) {
  const t = useTranslations("parents.detail");
  const translateError = useParentsError();
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const [isPending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deleteGuardian(guardianId);
      setDialog(null);
      if (!result.ok) {
        toast.error(translateError(result.error));
        return;
      }
      toast.success(t("deleted"));
      router.push("/parents");
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => setDialog("edit")}>
        <Pencil aria-hidden />
        {t("edit")}
      </Button>
      <Button variant="outline" onClick={() => setDialog("delete")}>
        <Trash2 aria-hidden />
        {t("delete")}
      </Button>
      <GuardianDialog
        guardianId={guardianId}
        hasAccount={hasAccount}
        defaults={defaults}
        open={dialog === "edit"}
        onOpenChange={(open) => !open && setDialog(null)}
      />
      <ConfirmDeleteDialog
        open={dialog === "delete"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t("deleteTitle", { name })}
        description={hasAccount ? t("deleteDescriptionAccount") : t("deleteDescription")}
        pending={isPending}
        onConfirm={remove}
      />
    </div>
  );
}
