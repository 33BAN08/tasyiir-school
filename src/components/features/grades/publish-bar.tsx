"use client";

import { EyeOff, Lock, MessageSquareText, Printer, Send, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { PostedAt } from "@/components/features/announcements/posted-at";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";
import type { Publication } from "@/lib/grades/publications";
import { publishGrades, unpublishGrades } from "@/lib/grades/publish-actions";

type Props = {
  classId: string;
  className: string;
  /** null = the year. */
  periodId: string | null;
  /** "Semestre 1" / "Année", as the switch shows it. */
  periodLabel: string;
  publication: Publication | null;
  /** The semester is locked (the year: every semester). */
  locked: boolean;
  canManage: boolean;
  students: number;
  /** Where the semesters are locked (grading setup). */
  lockHref: string;
  /** The class-council remarks of this class + semester. */
  councilHref: string;
  /** The whole class's report cards to print (published only). */
  printHref: string | null;
  /** Council remarks changed after the last publication (not on the cards until Republier). */
  councilChanged: number;
};

/**
 * Above the averages table: published to parents or not, and for
 * grades.manage Publier / Republier (rank shown or not) and Retirer.
 * The parents see a snapshot taken at that moment (report cards).
 */
export function PublishBar({
  classId, className, periodId, periodLabel, publication, locked, canManage, students, lockHref, councilHref, printHref, councilChanged,
}: Props) {
  const t = useTranslations("grades.publish");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [showRank, setShowRank] = useState(publication?.showRank ?? true);
  const error = (key: string) => {
    const k = `errors.${key}` as Parameters<typeof t>[0];
    return t.has(k) ? t(k) : t("errors.generic");
  };

  const publish = () =>
    startTransition(async () => {
      const result = await publishGrades(classId, periodId, showRank);
      if (!result.ok) return void toast.error(error(result.error));
      toast.success(t("published", { count: result.data.cards }));
      setOpen(false);
      router.refresh();
    });
  const unpublish = () =>
    startTransition(async () => {
      if (!publication) return;
      const result = await unpublishGrades(publication.id);
      if (!result.ok) return void toast.error(error(result.error));
      toast.success(t("unpublished"));
      setConfirmUndo(false);
      router.refresh();
    });

  return (
    <div
      data-publish-bar={publication ? "published" : "draft"}
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 text-sm"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        {publication ? (
          <span className="font-medium">
            {t("publishedOn")} <PostedAt value={publication.publishedAt} />
            {publication.publishedBy && <> · {t("by", { name: publication.publishedBy })}</>}
          </span>
        ) : (
          <span className="font-medium">{t("notPublished")}</span>
        )}
        {publication && !publication.showRank && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <EyeOff className="size-3.5" aria-hidden />
            {t("rankHidden")}
          </span>
        )}
        {canManage && publication && councilChanged > 0 && (
          <span className="flex items-center gap-1 text-xs text-warning" data-council-changed={councilChanged}>
            <MessageSquareText className="size-3.5" aria-hidden />
            {t("councilChanged", { count: councilChanged })}
          </span>
        )}
        {canManage && !locked && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground" data-publish-needs-lock>
            <Lock className="size-3.5" aria-hidden />
            {t(periodId ? "needsLock" : "needsLockYear")}{" "}
            <Link href={lockHref} className="text-primary underline-offset-4 hover:underline">{t("lockLink")}</Link>
          </span>
        )}
      </div>

      {canManage && (
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href={councilHref} data-council-link>
              <MessageSquareText aria-hidden />
              {t("council")}
            </Link>
          </Button>
          {printHref && (
            <Button asChild variant="outline" size="sm">
              <Link href={printHref} target="_blank" data-print-class>
                <Printer aria-hidden />
                {t("print")}
              </Link>
            </Button>
          )}
          {publication && (
            <Dialog open={confirmUndo} onOpenChange={setConfirmUndo}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={isPending}>
                  <Undo2 aria-hidden />
                  {t("unpublish")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("unpublishTitle", { period: periodLabel, class: className })}</DialogTitle>
                  <DialogDescription>{t("unpublishDescription")}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">{t("cancel")}</Button>
                  </DialogClose>
                  <Button variant="destructive" onClick={unpublish} disabled={isPending}>{t("unpublishConfirm")}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" disabled={!locked || isPending || students === 0} data-publish-button>
                <Send aria-hidden />
                {publication ? t("republish") : t("publish")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("dialogTitle", { period: periodLabel, class: className })}</DialogTitle>
                <DialogDescription>
                  {t(publication ? "dialogRepublish" : "dialogDescription", { count: students })}
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2">
                <Checkbox id="publish-rank" checked={showRank} onCheckedChange={(v) => setShowRank(v === true)} />
                <Label htmlFor="publish-rank">{t("showRank")}</Label>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">{t("cancel")}</Button>
                </DialogClose>
                <Button onClick={publish} disabled={isPending} data-publish-confirm>
                  {isPending ? t("publishing") : publication ? t("republish") : t("publish")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}
