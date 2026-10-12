"use client";

import { KeyRound } from "lucide-react";
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
import { resetStaffPassword } from "@/lib/staff/member-actions";

import { OneTimeCredentials } from "../one-time-credentials";
import { useStaffError } from "../use-staff-error";

type Props = { staffId: string; name: string };

/** Confirm → new temporary password, shown once in the same dialog. */
export function StaffPasswordReset({ staffId, name }: Props) {
  const t = useTranslations("staff.detail.reset");
  const translateError = useStaffError();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ email: string | null; password: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      if (result) router.refresh(); // status is now "waiting for first sign-in"
      setResult(null); // drop the password from memory
    }
  }

  function confirm() {
    startTransition(async () => {
      const res = await resetStaffPassword(staffId);
      if (!res.ok) {
        toast.error(translateError(res.error));
        setOpen(false);
        return;
      }
      toast.success(t("done", { name }));
      setResult({ email: res.data.email, password: res.data.temporaryPassword });
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <KeyRound aria-hidden />
          {t("button")}
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        // Closing by accident would lose the new password.
        onInteractOutside={(e) => result && e.preventDefault()}
        onEscapeKeyDown={(e) => result && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{result ? t("resultTitle", { name }) : t("title", { name })}</DialogTitle>
          <DialogDescription>{result ? t("resultDescription") : t("description")}</DialogDescription>
        </DialogHeader>
        {result && <OneTimeCredentials email={result.email} password={result.password} />}
        <DialogFooter>
          {result ? (
            <Button onClick={() => onOpenChange(false)}>{t("close")}</Button>
          ) : (
            <>
              <DialogClose asChild>
                <Button variant="outline" disabled={isPending}>
                  {t("cancel")}
                </Button>
              </DialogClose>
              <Button onClick={confirm} disabled={isPending}>
                {t("confirm")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
