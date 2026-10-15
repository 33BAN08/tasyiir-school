"use client";

import { Camera, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { removeStudentPhoto, setStudentPhoto } from "@/lib/students/photo-actions";
import { toStudentPhoto } from "@/lib/students/photo-resize";
import { PHOTO_BUCKET, PHOTO_SOURCE_TYPES, photoPath } from "@/lib/students/photo-rules";
import { createClient } from "@/lib/supabase/client";

import { StudentAvatar } from "./student-avatar";
import { useStudentsError } from "./use-students-error";

type Props = { schoolId: string; studentId: string; name: string; initials: string; photoUrl: string | null };

/**
 * Photo of an existing student: pick a file → square 512 px in the browser →
 * upload with the user's own session (Storage RLS) → setStudentPhoto saves it.
 */
export function StudentPhotoField({ schoolId, studentId, name, initials, photoUrl }: Props) {
  const t = useTranslations("students.photo");
  const translateError = useStudentsError();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  function upload(file: File) {
    startTransition(async () => {
      const photo = await toStudentPhoto(file);
      if ("error" in photo) {
        toast.error(translateError(photo.error));
        return;
      }
      const path = photoPath(schoolId, studentId, crypto.randomUUID(), photo.ext);
      const { error } = await createClient()
        .storage.from(PHOTO_BUCKET)
        .upload(path, photo.blob, { contentType: photo.blob.type, upsert: false });
      if (error) {
        toast.error(translateError("photoUpload"));
        return;
      }
      const result = await setStudentPhoto(studentId, path);
      if (!result.ok) {
        toast.error(translateError(result.error));
        return;
      }
      toast.success(t("saved"));
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await removeStudentPhoto(studentId);
      if (!result.ok) {
        toast.error(translateError(result.error));
        return;
      }
      toast.success(t("removed"));
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-4">
      <StudentAvatar url={photoUrl} initials={initials} alt={t("alt", { name })} className="size-16 text-base" />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => input.current?.click()}>
            <Camera aria-hidden />
            {isPending ? t("uploading") : photoUrl ? t("change") : t("add")}
          </Button>
          {photoUrl && (
            <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={remove}>
              <Trash2 aria-hidden />
              {t("remove")}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
      </div>
      <input
        ref={input}
        type="file"
        accept={PHOTO_SOURCE_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-label={t("add")}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // picking the same file again still fires
          if (file) upload(file);
        }}
      />
    </div>
  );
}
