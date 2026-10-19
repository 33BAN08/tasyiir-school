"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { ConfirmDeleteDialog } from "@/components/features/setup/confirm-dialog";
import { FormTextField } from "@/components/features/forms/form-text-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRouter } from "@/i18n/navigation";
import { isolate } from "@/lib/format";
import { deleteAnnouncement, updateAnnouncement } from "@/lib/announcements/actions";
import { announcementEditSchema, type AnnouncementEditValues } from "@/lib/validations/announcements";

import { BodyField } from "./body-field";
import { useAnnouncementError } from "./use-announcement-error";

type Props = { id: string; title: string; body: string; backHref: string };

/** Edit (title and text) and delete, for the author or announcements.manage. */
export function AnnouncementActions({ id, title, body, backHref }: Props) {
  const t = useTranslations("announcements");
  const translateError = useAnnouncementError();
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<AnnouncementEditValues>({ resolver: zodResolver(announcementEditSchema), defaultValues: { title, body } });

  const save = form.handleSubmit(() => {
    const values = form.getValues();
    startTransition(async () => {
      const result = await updateAnnouncement(id, values);
      if (!result.ok) {
        if (result.field === "title" || result.field === "body") form.setError(result.field, { message: result.error }, { shouldFocus: true });
        else toast.error(translateError(result.error));
        return;
      }
      toast.success(t("form.updated"));
      setDialog(null);
      router.refresh();
    });
  });

  function remove() {
    startTransition(async () => {
      const result = await deleteAnnouncement(id);
      if (!result.ok) {
        setDialog(null);
        toast.error(translateError(result.error));
        return;
      }
      toast.success(t("delete.done"));
      router.replace(backHref);
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        className="min-h-11"
        onClick={() => {
          form.reset({ title, body });
          setDialog("edit");
        }}
      >
        <Pencil aria-hidden />
        {t("edit")}
      </Button>
      <Button variant="outline" className="min-h-11 text-destructive" onClick={() => setDialog("delete")}>
        <Trash2 aria-hidden />
        {t("delete.button")}
      </Button>

      <Dialog open={dialog === "edit"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("form.editTitle")}</DialogTitle>
            <DialogDescription>{t("form.editDescription")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} noValidate className="flex flex-col gap-6">
            <FormTextField form={form} name="title" label={t("form.title")} autoComplete="off" dir="auto" translateError={translateError} />
            <Controller
              control={form.control}
              name="body"
              render={({ field, fieldState }) => (
                <BodyField
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message ? translateError(fieldState.error.message) : undefined}
                />
              )}
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isPending}>
                  {t("form.cancel")}
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isPending}>
                {isPending ? t("form.saving") : t("form.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={dialog === "delete"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t("delete.title", { name: isolate(title) })}
        description={t("delete.description")}
        pending={isPending}
        onConfirm={remove}
      />
    </div>
  );
}
