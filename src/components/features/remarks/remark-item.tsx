"use client";

import { Check, CheckCheck, Pencil, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { PostedAt } from "@/components/features/announcements/posted-at";
import { ConfirmDeleteDialog } from "@/components/features/setup/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { deleteRemark, markRemarkRead } from "@/lib/remarks/actions";
import type { Remark } from "@/lib/remarks/queries";
import { studentName } from "@/lib/students/names";

import { RemarkDialog } from "./remark-dialog";
import { RemarkTypeBadge } from "./remark-type";
import { useRemarkError } from "./use-remark-error";

type Props = {
  remark: Remark;
  mode: "staff" | "parent";
  userId: string;
  /** The director / attendance.manage: delete any remark, any time (logged). */
  canModerate?: boolean;
  /** Class lists show whose remark it is (a link to the student page when `studentHref`). */
  showStudent?: boolean;
  studentHref?: boolean;
};

/** One remark: type, text, when, who; read state; the actions this reader has. */
export function RemarkItem({ remark: r, mode, userId, canModerate = false, showStudent = false, studentHref = false }: Props) {
  const t = useTranslations("remarks");
  const locale = useLocale();
  const translateError = useRemarkError();
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const [isPending, startTransition] = useTransition();
  const name = r.student ? studentName(r.student, locale) : "";
  const mine = r.createdBy === userId;
  const canEdit = mode === "staff" && mine && r.editable;
  const canDelete = mode === "staff" && ((mine && r.editable) || canModerate);
  const moderating = canDelete && !mine;

  function remove() {
    startTransition(async () => {
      const result = await deleteRemark(r.id);
      setDialog(null);
      if (!result.ok) return void toast.error(translateError(result.error));
      toast.success(t("delete.done"));
      router.refresh();
    });
  }

  function markRead() {
    startTransition(async () => {
      const result = await markRemarkRead(r.id);
      if (!result.ok) return void toast.error(translateError(result.error));
      router.refresh();
    });
  }

  return (
    <li data-remark-read={r.readAt ? "true" : "false"} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <RemarkTypeBadge type={r.type} />
          {showStudent &&
            (studentHref ? (
              <Link href={`/students/${r.studentId}`} className="text-sm font-medium underline-offset-4 hover:underline">
                <bdi>{name}</bdi>
              </Link>
            ) : (
              <bdi className="text-sm font-medium">{name}</bdi>
            ))}
        </span>
        {mode === "parent" ? (
          r.readAt ? (
            <span className="inline-flex items-center gap-1 text-sm text-success">
              <CheckCheck className="size-4" aria-hidden />
              {t("read")}
            </span>
          ) : (
            <Button size="sm" variant="outline" className="min-h-9" onClick={markRead} disabled={isPending}>
              <Check aria-hidden />
              {t("markRead")}
            </Button>
          )
        ) : (
          <Badge variant={r.readAt ? "secondary" : "outline"}>{r.readAt ? t("readByParents") : t("unreadByParents")}</Badge>
        )}
      </div>
      <p dir="auto" className="whitespace-pre-line break-words">
        {r.body}
      </p>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        <PostedAt value={r.createdAt} />
        {r.updatedAt && <span>{t("edited")}</span>}
        {mode === "staff" && (mine ? <span>{t("byYou")}</span> : r.authorName && <bdi>{t("by", { name: r.authorName })}</bdi>)}
      </p>
      {(canEdit || canDelete) && (
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Button size="sm" variant="ghost" className="min-h-9" onClick={() => setDialog("edit")}>
              <Pencil aria-hidden />
              {t("edit")}
            </Button>
          )}
          {canDelete && (
            <Button size="sm" variant="ghost" className="min-h-9 text-destructive" onClick={() => setDialog("delete")}>
              <Trash2 aria-hidden />
              {t("delete.button")}
            </Button>
          )}
        </div>
      )}
      {canEdit && (
        <RemarkDialog
          studentId={r.studentId}
          studentName={name}
          remark={{ id: r.id, type: r.type, body: r.body }}
          open={dialog === "edit"}
          onOpenChange={(open) => setDialog(open ? "edit" : null)}
        />
      )}
      <ConfirmDeleteDialog
        open={dialog === "delete"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t("delete.title")}
        description={t(moderating ? "delete.moderateDescription" : "delete.description")}
        pending={isPending}
        onConfirm={remove}
      />
    </li>
  );
}
