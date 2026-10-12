"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useRouter } from "@/i18n/navigation";
import { deleteRole } from "@/lib/roles/actions";

import { useRoleError } from "./use-role-error";

/** Deletes a custom role nobody holds, behind a confirmation. */
export function DeleteRoleButton({ roleId, name }: { roleId: string; name: string }) {
  const t = useTranslations("staffRoles.delete");
  const translateError = useRoleError();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await deleteRole(roleId);
      if (!result.ok) {
        toast.error(translateError(result.error));
        setOpen(false);
        return;
      }
      toast.success(t("done", { name }));
      router.push("/staff/roles");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">
          <Trash2 aria-hidden />
          {t("button")}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("title", { name })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isPending}>
              {t("cancel")}
            </Button>
          </DialogClose>
          <Button variant="destructive" onClick={confirm} disabled={isPending}>
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
