"use client";

import { RotateCcw, UserX } from "lucide-react";
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
import { setStaffActive } from "@/lib/staff/member-actions";

import { useStaffError } from "../use-staff-error";

type Props = { staffId: string; name: string; deactivated: boolean };

/** Deactivate / reactivate, always behind a confirmation dialog. Never deletes anything. */
export function StaffActiveControl({ staffId, name, deactivated }: Props) {
  const t = useTranslations("staff.detail.active");
  const translateError = useStaffError();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const key = deactivated ? "reactivate" : "deactivate";

  function confirm() {
    startTransition(async () => {
      const result = await setStaffActive(staffId, deactivated);
      if (!result.ok) {
        toast.error(translateError(result.error));
        return;
      }
      toast.success(t(`${key}.done`, { name }));
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={deactivated ? "outline" : "destructive"}>
          {deactivated ? <RotateCcw aria-hidden /> : <UserX aria-hidden />}
          {t(`${key}.button`)}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t(`${key}.title`, { name })}</DialogTitle>
          <DialogDescription>{t(`${key}.description`)}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isPending}>
              {t("cancel")}
            </Button>
          </DialogClose>
          <Button variant={deactivated ? "default" : "destructive"} onClick={confirm} disabled={isPending}>
            {t(`${key}.confirm`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
