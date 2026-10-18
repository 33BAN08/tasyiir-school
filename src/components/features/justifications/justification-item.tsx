"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { formatDate, ltr } from "@/lib/format";
import { cancelJustification } from "@/lib/justifications/actions";
import { cn } from "@/lib/utils";

import { StateBadge } from "./state-badge";
import { ViewNoteButton } from "./view-note-button";
import { useJustificationError } from "./use-justification-error";

type Props = {
  id: string;
  status: "pending" | "approved" | "rejected";
  fromDate: string;
  toDate: string;
  reason: string;
  hasFile: boolean;
  reviewNote: string | null;
  /** The parent may withdraw it (a still-pending "days" justification of theirs). */
  canCancel: boolean;
};

/** One justification of a child: period, reason, state, the note (opens in a new tab) and, while pending, "Withdraw". */
export function JustificationItem({ id, status, fromDate, toDate, reason, hasFile, reviewNote, canCancel }: Props) {
  const t = useTranslations("portal.absences.justification");
  const translateError = useJustificationError();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const period =
    fromDate === toDate ? ltr(formatDate(fromDate)) : t("period", { from: ltr(formatDate(fromDate)), to: ltr(formatDate(toDate)) });

  function withdraw() {
    startTransition(async () => {
      const result = await cancelJustification(id);
      setConfirming(false);
      if (!result.ok) {
        toast.error(translateError(result.error));
        router.refresh();
        return;
      }
      toast.success(t("withdrawn"));
      router.refresh();
    });
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium tabular-nums">{period}</span>
        <StateBadge state={status === "approved" ? "justified" : status} />
      </div>
      <p className="text-sm [overflow-wrap:anywhere]">
        <bdi>{reason}</bdi>
      </p>
      {reviewNote && (
        <p className={cn("text-sm text-muted-foreground [overflow-wrap:anywhere]")}>
          {t("schoolNote")} <bdi>{reviewNote}</bdi>
        </p>
      )}
      {(hasFile || (canCancel && status === "pending")) && (
        <div className="flex flex-wrap gap-2">
          {hasFile && <ViewNoteButton id={id} label={t("viewNote")} translateError={translateError} />}
          {canCancel && status === "pending" &&
            (confirming ? (
              <>
                <Button type="button" variant="destructive" size="sm" className="min-h-11" disabled={isPending} onClick={withdraw}>
                  <Trash2 aria-hidden />
                  {isPending ? t("withdrawing") : t("confirmWithdraw")}
                </Button>
                <Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={isPending} onClick={() => setConfirming(false)}>
                  {t("keep")}
                </Button>
              </>
            ) : (
              <Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={isPending} onClick={() => setConfirming(true)}>
                <Trash2 aria-hidden />
                {t("withdraw")}
              </Button>
            ))}
        </div>
      )}
    </li>
  );
}
