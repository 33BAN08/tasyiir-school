"use client";

import { FilePlus2 } from "lucide-react";
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { formatDate, isolate, ltr } from "@/lib/format";
import { uploadNote } from "@/lib/justifications/upload";
import { justifyAbsence } from "@/lib/justifications/staff-actions";

import { NoteField } from "./note-field";
import { useJustificationError, useStaffJustificationError } from "./use-justification-error";

type Props = {
  schoolId: string;
  sessionId: string;
  studentId: string;
  studentName: string;
  /** The day of the absence ("yyyy-MM-dd"). */
  date: string;
};

/**
 * Staff justify ONE absence (or late arrival) from a paper note: a reason and
 * an optional photo / PDF of the note. It is approved at once. The note is
 * prepared and uploaded in the browser (as for parents), then the Server
 * Action saves the justification and removes the file again if it fails.
 */
export function MarkJustifyDialog({ schoolId, sessionId, studentId, studentName, date }: Props) {
  const t = useTranslations("absences.justifications.mark");
  const translateError = useStaffJustificationError();
  const translateFileError = useJustificationError();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setReason("");
    setReasonError(null);
    setFile(null);
    setFileError(null);
  }

  function save() {
    if (!reason.trim()) {
      setReasonError(translateError("reasonRequired"));
      return;
    }
    startTransition(async () => {
      const note = await uploadNote(file, schoolId, studentId);
      if ("error" in note) {
        setFileError(translateFileError(note.error));
        return;
      }
      const result = await justifyAbsence(sessionId, studentId, reason, note.path);
      if (!result.ok) {
        if (result.error === "reasonRequired" || result.error === "tooLong") setReasonError(translateError(result.error));
        else if (result.error === "fileUpload") setFileError(translateFileError("fileUpload"));
        else toast.error(translateError(result.error));
        return;
      }
      toast.success(t("saved"));
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={t("openFor", { name: isolate(studentName) })}>
          <FilePlus2 aria-hidden />
          {t("open")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description", { name: isolate(studentName), date: ltr(formatDate(date)) })}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Field data-invalid={!!reasonError}>
            <FieldLabel htmlFor="field-mark-reason">{t("reason")}</FieldLabel>
            <Textarea
              id="field-mark-reason"
              rows={3}
              maxLength={500}
              value={reason}
              aria-invalid={!!reasonError}
              placeholder={t("reasonPlaceholder")}
              onChange={(e) => {
                setReason(e.target.value);
                setReasonError(null);
              }}
            />
            {reasonError && <FieldError>{reasonError}</FieldError>}
          </Field>
          <NoteField
            file={file}
            onChange={(f) => {
              setFile(f);
              setFileError(null);
            }}
            error={fileError}
            disabled={isPending}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
