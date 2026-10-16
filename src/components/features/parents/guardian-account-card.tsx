"use client";

import { KeyRound, RotateCcw, UserPlus, UserX } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { createParentAccount, resetParentPassword, setParentActive } from "@/lib/parents/account-actions";
import type { AccountStatus } from "@/lib/parents/guardians";
import { formatMobile } from "@/lib/parents/phone";

import { AccountStatusBadge } from "./account-status-badge";
import { ParentCredentialsDialog } from "./parent-credentials-dialog";
import { useParentsError } from "./use-parents-error";

type Props = { guardianId: string; phone: string; status: AccountStatus };

/** The parent's account: create it, reset its password, deactivate / reactivate it. */
export function GuardianAccountCard({ guardianId, phone, status }: Props) {
  const t = useTranslations("parents.account");
  const locale = useLocale();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t(`explain.${status}`)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Label above value: the card is narrow and some statuses are long. */}
        <dl className="flex flex-col gap-3 text-sm">
          <div className="flex flex-col items-start gap-1">
            <dt className="text-muted-foreground">{t("statusLabel")}</dt>
            <dd>
              <AccountStatusBadge status={status} />
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">{t("phone")}</dt>
            <dd className="font-numeric tabular-nums">
              <bdi>{formatMobile(phone)}</bdi>
            </dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
          {status === "none" ? (
            <ParentCredentialsDialog
              trigger={
                <Button>
                  <UserPlus aria-hidden />
                  {t("create.button")}
                </Button>
              }
              texts={{
                title: t("create.title"),
                description: t("create.description"),
                confirm: t("create.confirm"),
                done: t("create.done"),
              }}
              run={() => createParentAccount(guardianId, locale)}
            />
          ) : (
            <>
              {status !== "deactivated" && (
                <ParentCredentialsDialog
                  trigger={
                    <Button variant="outline">
                      <KeyRound aria-hidden />
                      {t("reset.button")}
                    </Button>
                  }
                  texts={{
                    title: t("reset.title"),
                    description: t("reset.description"),
                    confirm: t("reset.confirm"),
                    done: t("reset.done"),
                  }}
                  run={() => resetParentPassword(guardianId)}
                />
              )}
              <ParentActiveControl guardianId={guardianId} deactivated={status === "deactivated"} />
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ParentActiveControl({ guardianId, deactivated }: { guardianId: string; deactivated: boolean }) {
  const t = useTranslations("parents.account");
  const translateError = useParentsError();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const key = deactivated ? "reactivate" : "deactivate";

  function confirm() {
    startTransition(async () => {
      const result = await setParentActive(guardianId, deactivated);
      if (!result.ok) {
        toast.error(translateError(result.error));
        return;
      }
      toast.success(t(`${key}.done`));
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
          <DialogTitle>{t(`${key}.title`)}</DialogTitle>
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
