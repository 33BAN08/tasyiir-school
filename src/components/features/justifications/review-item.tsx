"use client";

import { Check, RotateCcw, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Link, useRouter } from "@/i18n/navigation";
import { formatDate, ltr } from "@/lib/format";
import { removeJustification, reviewJustification } from "@/lib/justifications/staff-actions";

import { StateBadge } from "./state-badge";
import { useStaffJustificationError } from "./use-justification-error";
import { ViewNoteButton } from "./view-note-button";

type Props = {
  id: string;
  studentId: string;
  /** Student's name in the UI language, and their class this year. */
  name: string;
  className: string | null;
  kind: "days" | "mark";
  status: "pending" | "approved" | "rejected";
  fromDate: string;
  toDate: string;
  reason: string;
  hasFile: boolean;
  reviewNote: string | null;
  /** attendance.manage: may review and remove. */
  canManage: boolean;
};

type Mode = "idle" | "rejecting" | "removing";

/** One justification in the school's review list: who, when, why, the note, and approve / reject / reopen / remove. */
export function ReviewItem({ id, studentId, name, className, kind, status, fromDate, toDate, reason, hasFile, reviewNote, canManage }: Props) {
  const t = useTranslations("absences.justifications");
  const translateError = useStaffJustificationError();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const period =
    fromDate === toDate ? ltr(formatDate(fromDate)) : t("period", { from: ltr(formatDate(fromDate)), to: ltr(formatDate(toDate)) });

  function review(next: "pending" | "approved" | "rejected", text: string) {
    startTransition(async () => {
      const result = await reviewJustification(id, next, text);
      if (!result.ok) {
        toast.error(translateError(result.error));
        router.refresh();
        return;
      }
      toast.success(t(`done.${next}`));
      setMode("idle");
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await removeJustification(id);
      if (!result.ok) {
        toast.error(translateError(result.error));
        router.refresh();
        return;
      }
      toast.success(t("done.removed"));
      router.refresh();
    });
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <Link href={`/students/${studentId}`} className="font-semibold hover:underline">
            <bdi>{name}</bdi>
          </Link>
          {className && <bdi className="text-sm text-muted-foreground">{className}</bdi>}
        </div>
        <StateBadge state={status === "approved" ? "justified" : status} />
      </div>
      <p className="text-sm text-muted-foreground">
        <span className="tabular-nums">{period}</span> · {t(kind === "days" ? "kindDays" : "kindMark")}
      </p>
      <p className="text-sm [overflow-wrap:anywhere]">
        <bdi>{reason}</bdi>
      </p>
      {reviewNote && (
        <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
          {t("replyLabel")} <bdi>{reviewNote}</bdi>
        </p>
      )}

      {mode === "rejecting" && (
        <div className="flex flex-col gap-2">
          <label htmlFor={`note-${id}`} className="text-sm font-medium">
            {t("replyField")}
          </label>
          <Textarea id={`note-${id}`} rows={2} maxLength={300} value={note} placeholder={t("replyPlaceholder")} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {hasFile && <ViewNoteButton id={id} label={t("viewNote")} translateError={translateError} />}
        {canManage && mode === "idle" && (
          <>
            {status !== "approved" && (
              <Button type="button" size="sm" className="min-h-11" disabled={isPending} onClick={() => review("approved", "")}>
                <Check aria-hidden />
                {t("approve")}
              </Button>
            )}
            {status !== "rejected" && (
              <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={isPending} onClick={() => setMode("rejecting")}>
                <X aria-hidden />
                {t("reject")}
              </Button>
            )}
            {status !== "pending" && (
              <Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={isPending} onClick={() => review("pending", "")}>
                <RotateCcw aria-hidden />
                {t("reopen")}
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={isPending} onClick={() => setMode("removing")}>
              <Trash2 aria-hidden />
              {t("remove")}
            </Button>
          </>
        )}
        {canManage && mode === "rejecting" && (
          <>
            <Button type="button" variant="destructive" size="sm" className="min-h-11" disabled={isPending} onClick={() => review("rejected", note)}>
              {isPending ? t("saving") : t("confirmReject")}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={isPending} onClick={() => setMode("idle")}>
              {t("cancel")}
            </Button>
          </>
        )}
        {canManage && mode === "removing" && (
          <>
            <Button type="button" variant="destructive" size="sm" className="min-h-11" disabled={isPending} onClick={remove}>
              <Trash2 aria-hidden />
              {isPending ? t("saving") : t("confirmRemove")}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={isPending} onClick={() => setMode("idle")}>
              {t("cancel")}
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
