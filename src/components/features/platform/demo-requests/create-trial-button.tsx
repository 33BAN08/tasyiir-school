"use client";

import { MessageCircle, Rocket } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { CopyButton } from "@/components/features/forms/copy-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "@/i18n/navigation";
import { createTrialFromRequest, type CreateTrialResult } from "@/lib/demo-requests/trial-actions";
import { ltr } from "@/lib/format";

type Created = Extract<CreateTrialResult, { ok: true }>["data"];

/**
 * "Créer l'essai" on a trial request: two steps (confirm, then create). The
 * temporary password is shown once, in this dialog only, with the WhatsApp
 * message that sends it.
 */
export function CreateTrialButton({ requestId, schoolName }: { requestId: string; schoolName: string }) {
  const t = useTranslations("platform.trial");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [created, setCreated] = useState<Created | null>(null);

  function create() {
    startTransition(async () => {
      const result = await createTrialFromRequest(requestId).catch(() => null);
      if (!result) return void toast.error(t("errors.generic"));
      if (!result.ok) return void toast.error(t(`errors.${result.error}`));
      setCreated(result.data);
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} data-create-trial>
        <Rocket aria-hidden />
        {t("create")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          // Once created, closing is fine: the row now shows the school.
          if (!pending) setOpen(next);
        }}
      >
        <DialogContent>
          {created ? (
            <>
              <DialogHeader>
                <DialogTitle>{t("doneTitle")}</DialogTitle>
                <DialogDescription>{t("doneDescription", { date: ltr(created.lastDay.split("-").reverse().join("/")) })}</DialogDescription>
              </DialogHeader>
              <dl className="grid gap-3 text-sm" data-trial-credentials>
                <div className="flex items-center justify-between gap-2 rounded-md border p-3">
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">{t("email")}</dt>
                    <dd className="truncate font-medium" dir="ltr">
                      {created.email}
                    </dd>
                  </div>
                  <CopyButton value={created.email} />
                </div>
                <div className="flex items-center justify-between gap-2 rounded-md border p-3">
                  <div>
                    <dt className="text-muted-foreground">{t("password")}</dt>
                    <dd className="font-mono font-medium" dir="ltr">
                      {created.password}
                    </dd>
                  </div>
                  <CopyButton value={created.password} />
                </div>
              </dl>
              <p className="text-sm text-muted-foreground">{t("passwordOnce")}</p>
              <DialogFooter className="gap-2">
                <Button asChild variant="outline">
                  <Link href={`/platform/schools/${created.schoolId}`}>{t("viewSchool")}</Link>
                </Button>
                <Button asChild>
                  <a href={created.whatsappUrl} target="_blank" rel="noopener noreferrer">
                    <MessageCircle aria-hidden />
                    {t("sendWhatsapp")}
                  </a>
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{t("confirmTitle", { school: schoolName })}</DialogTitle>
                <DialogDescription>{t("confirmDescription")}</DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                  {t("cancel")}
                </Button>
                <Button onClick={create} disabled={pending}>
                  <Rocket aria-hidden />
                  {pending ? t("creating") : t("confirm")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
