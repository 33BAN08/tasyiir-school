"use client";

import { Ban, RotateCcw } from "lucide-react";
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
import { setSchoolStatus } from "@/lib/platform/school-actions";
import type { SchoolStatus } from "@/lib/validations/platform";

type Props = { schoolId: string; schoolName: string; status: SchoolStatus };

/** Suspend / reactivate, always behind a confirmation dialog. Never deletes anything. */
export function SchoolStatusControl({ schoolId, schoolName, status }: Props) {
  const t = useTranslations("platform.schoolDetail.statusControl");
  const tErrors = useTranslations("platform.errors");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const suspending = status === "active";
  const key = suspending ? "suspend" : "activate";

  function confirm() {
    startTransition(async () => {
      const result = await setSchoolStatus(schoolId, suspending ? "suspended" : "active");
      if (!result.ok) {
        toast.error(tErrors(result.error));
        return;
      }
      toast.success(t(`${key}.done`, { name: schoolName }));
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={suspending ? "destructive" : "outline"}>
          {suspending ? <Ban aria-hidden /> : <RotateCcw aria-hidden />}
          {t(`${key}.button`)}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t(`${key}.title`, { name: schoolName })}</DialogTitle>
          <DialogDescription>{t(`${key}.description`)}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isPending}>
              {t("cancel")}
            </Button>
          </DialogClose>
          <Button
            variant={suspending ? "destructive" : "default"}
            onClick={confirm}
            disabled={isPending}
          >
            {t(`${key}.confirm`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
