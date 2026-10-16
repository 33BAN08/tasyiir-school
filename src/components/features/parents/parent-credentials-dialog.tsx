"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { OneTimeCredentials } from "@/components/features/staff/one-time-credentials";
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
import { formatMobile } from "@/lib/parents/phone";

import { useParentsError } from "./use-parents-error";

type Texts = { title: string; description: string; confirm: string; done: string };

type Props = {
  trigger: ReactNode;
  texts: Texts;
  /** Creates the account or resets the password; returns the temporary password once. */
  run: () => Promise<{ ok: true; data: { phone: string; temporaryPassword: string } } | { ok: false; error: string }>;
};

/** Confirm → the phone + temporary password, shown once in the same dialog (never stored, never logged). */
export function ParentCredentialsDialog({ trigger, texts, run }: Props) {
  const t = useTranslations("parents.account");
  const translateError = useParentsError();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ phone: string; password: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      if (result) router.refresh();
      setResult(null); // drop the password from memory
    }
  }

  function confirm() {
    startTransition(async () => {
      const res = await run();
      if (!res.ok) {
        toast.error(translateError(res.error));
        setOpen(false);
        return;
      }
      toast.success(texts.done);
      setResult({ phone: res.data.phone, password: res.data.temporaryPassword });
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        showCloseButton={false}
        // Closing by accident would lose the password.
        onInteractOutside={(e) => result && e.preventDefault()}
        onEscapeKeyDown={(e) => result && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{result ? t("resultTitle") : texts.title}</DialogTitle>
          <DialogDescription>{result ? t("resultDescription") : texts.description}</DialogDescription>
        </DialogHeader>
        {result && (
          <OneTimeCredentials email={formatMobile(result.phone)} password={result.password} loginLabel={t("phone")} />
        )}
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
                {texts.confirm}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
